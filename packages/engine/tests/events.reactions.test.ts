import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import type { Question } from '../src/core/external.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';
import { withColumn } from '../src/model/sheet-columns.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const shieldWorld: any = {
  ...system,
  effects: {
    ...system.effects,
    shield: {
      label: 'Щит', activation: 'passive',
      on: [{ on: 'before:ataka', confirm: {}, if: { expr: '@cel == @holder and @hit.success' }, steps: [{ type: 'status', mode: 'apply', effect: 'shield_up', to: { expr: '@holder' } }] }],
    },
    shield_up: {
      label: 'Под щитом', activation: 'passive', duration: { kind: 'turns', max: 1 },
      modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '5' } }],
    },
  },
};
const shielded = { ...mirra, effects: [{ effectId: 'shield' }] };

const play = (sys: any, sheets: any[], dice: number[], answer?: (q: Question) => string[], from = 'arven', to = 'mirra', actionId = 'longsword-item:0') =>
  exchange({ system: sys, compendium, die: queue(...dice), sheets, actionId, fromId: from, toId: to, ...(answer ? { answer } : {}) });
const ids = (q: Question) => q.offers.map(o => o.id);
const stepOf = (played: ReturnType<typeof exchange>, step: string): any =>
  played.reports.flatMap(x => x.report.trace).find(t => t.step === step);

group('реакция цели: пауза перед разрешением', () => {
  const attack = (target: any, dice: number[], answer?: (q: Question) => string[], sys: any = shieldWorld) =>
    play(sys, [arven, target], dice, answer);
  const noAnswer = (): string[] => [];

  test('«Щит» предлагается только когда атака попала бы — стол заранее знает исход', () => {
    const hit = attack(shielded, [9, 5], noAnswer);
    deepEq(hit.questions.filter(q => q.window === 'target').map(ids), [['shield']]);
    eq(hit.questions[0]!.results.hit && (hit.questions[0]!.results.hit as any).success, true);

    const miss = attack(shielded, [2, 5], noAnswer);
    eq(miss.questions.length, 0);
  });

  test('без реакции на листе предлагать нечего', () => {
    eq(attack(mirra, [9, 5], noAnswer).questions.length, 0);
  });

  test('игрок применил «Щит» — броня выросла, и та же атака промахнулась', () => {
    const plain = attack(shielded, [9, 5]);
    eq(stepOf(plain, 'hit').success, true, 'без щита 15 против 14 — попадание');

    const r = attack(shielded, [9, 5], q => (q.window === 'target' ? ['shield'] : []));
    deepEq(r.sheets.find(s => s.id === 'mirra')!.effects.map(e => e.effectId), ['shield', 'shield_up']);
    const strike = r.reports.find(x => x.report.effect === 'strike')!.report;
    eq(stepOf(r, 'hit').success, false, 'та же кость, но 15 против 19');
    eq(r.sheets.find(s => s.id === 'mirra')!.values.hp_current, mirra.values.hp_current);
  });

  test('выбрать то, что не предлагалось, нельзя', () => {
    throws(() => attack(shielded, [9, 5, 4, 4, 4, 4], () => ['thorns']), 'не предлагается');
  });

  test('реакция со счётчиком тратится', () => {
    const once: any = { ...shieldWorld, effects: { ...shieldWorld.effects, shield: { ...shieldWorld.effects.shield, duration: { kind: 'uses', max: 1 } } } };
    const sheet = { ...mirra, effects: [{ effectId: 'shield', usesLeft: 1 }] };
    const r = attack(sheet, [9, 5], q => (q.window === 'target' ? ['shield'] : []), once);
    deepEq(r.sheets.find(s => s.id === 'mirra')!.effects.map(e => e.effectId), ['shield_up']);
  });
});

group('увидев кости: решил докинуть', () => {
  const luckWorld: any = {
    ...withColumn(system, { key: 'inspiration', label: 'Вдохновение', kind: 'number', default: 1, min: 0 }),
    effects: {
      ...system.effects,
      inspire: {
        label: 'Вдохновение: перебросить', activation: 'passive',
        on: [{ on: 'seen', confirm: {}, if: { expr: '@roller == @holder and @holder.inspiration > 0' }, steps: [{ type: 'apply', target: { expr: '@holder.inspiration' }, direction: 'subtract', value: { expr: '1' } }, { type: 'roll-add', count: { expr: '1' }, keep: 'best' }] }],
      },
    },
  };
  const inspired = { ...arven, values: { ...arven.values, inspiration: 1 }, effects: [{ effectId: 'inspire' }] };
  const decline = (): string[] => [];

  test('предлагается, пока есть очко; после траты — нет', () => {
    const r = play(luckWorld, [inspired, mirra], [4, 5], decline);
    deepEq(r.questions.filter(q => q.window === 'seen').map(ids), [['inspire']]);
    const broke = { ...inspired, values: { ...inspired.values, inspiration: 0 } };
    eq(play(luckWorld, [broke, mirra], [4, 5], decline).questions.length, 0);
  });

  test('применил — очко потрачено, кость докинута к выпавшему', () => {
    const r = play(luckWorld, [inspired, mirra], [4, 18, 5], q => (q.window === 'seen' ? ['inspire'] : []));
    eq(r.sheets.find(s => s.id === 'arven')!.values.inspiration, 0);
    const strike = r.reports.find(x => x.report.effect === 'strike')!.report;
    deepEq((strike.trace[0] as any).rolls, [4, 18]);
    eq((strike.trace[0] as any).kept, 18);
  });
});

group('подписка на исходящее: вампиризм и метка на цели', () => {
  const vampWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      vampiric: {
        label: 'Вампиризм', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'after:damage', if: { expr: '@istochnik == @holder' }, steps: [{ type: 'apply', target: { expr: '@holder.hp_current' }, direction: 'add',
          value: { expr: 'floor(@amount / 2)' } }] }],
      },
      brand: {
        label: 'Метка охотника', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'after:fire_bolt', if: { expr: '@deystvuyuschiy == @holder and @hit.success' }, steps: [{ type: 'status', mode: 'apply', effect: 'poisoned', to: { expr: '@cel' } }] }],
      },
    },
  };
  const caster = { ...arven, values: { ...arven.values, hp_current: 10 }, has: [{ of: 'fire-bolt' }] };

  test('нанёс урон вызовом — сам подлечился на половину', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(15, 8, 6), sheets: [{ ...caster, effects: [{ effectId: 'vampiric' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    const dealt = r.reports.flatMap(x => x.report.emitted).find(e => e.event === 'damage')!.amount;
    ok(dealt > 0, 'урон дошёл');
    eq(r.sheets.find(s => s.id === 'arven')!.values.hp_current, 10 + Math.floor(dealt / 2));
    ok(r.log.some(line => line.includes('Вампиризм')), 'журнал называет срабатывание вампиризма');
  });

  test('промах — вампиризм молчит: вызова урона не было', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(1, 8), sheets: [{ ...caster, effects: [{ effectId: 'vampiric' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    eq(r.sheets.find(s => s.id === 'arven')!.values.hp_current, 10);
    eq(r.reports.flatMap(x => x.report.emitted).length, 0, 'урон не вызывался');
  });

  test('«кому: цели» — исходящий триггер шлёт цели свой конверт', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(15, 8, 6), sheets: [{ ...caster, effects: [{ effectId: 'brand' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    ok(r.sheets.find(s => s.id === 'mirra')!.effects.some(e => e.effectId === 'poisoned'));
    const brand = r.reports.find(x => x.toId === 'mirra')!.report.reactions!.find(x => x.label === 'Метка охотника')!;
    deepEq(brand.effects, ['poisoned']);
  });
});

group('вопрос «увидев кости» видит факты собственного броска', () => {
  const luck: any = {
    ...withColumn(system, { key: 'inspiration', label: 'Вдохновение', kind: 'number', default: 1, min: 0 }),
    effects: {
      ...system.effects,
      inspire: {
        label: 'Вдохновение: перебросить', activation: 'passive',
        on: [{ on: 'seen', confirm: {}, if: { expr: '@roller == @holder' }, steps: [{ type: 'roll-add', count: { expr: '1' }, keep: 'best' }] }],
      },
    },
  };
  const inspired = { ...arven, effects: [{ effectId: 'inspire' }] };
  const senderQuestion = (sys: any) => {
    const r = play(sys, [inspired, mirra], [17, 5], () => []);
    return r.questions.find(q => q.window === 'seen')!;
  };

  test('вопрос несёт выпавшее, число костей и признак правки', () => {
    const seen = senderQuestion(luck).results.roll as any;
    eq(seen.natural, 17);
    eq(seen.rolled, 1);
    eq(seen.edited, false);
    deepEq(seen.parts, {});
  });

  test('вопрос несёт части броска: Надежду и Страх видно у бросающего, а не только у цели', () => {
    const duality: any = {
      ...luck,
      constants: { ...(luck.constants ?? {}), lead_die: {
        label: 'Кости дуальности', kind: 'die',
        dice: [{ count: 1, sides: 12, name: 'надежда', label: 'Надежда' }, { count: 1, sides: 12, name: 'страх', label: 'Страх' }],
      } },
    };
    const r = play(duality, [inspired, mirra], [9, 4, 5], () => []);
    const seen = r.questions.find(q => q.window === 'seen')!.results.roll as any;
    deepEq(seen.parts, { надежда: 9, страх: 4 });
  });
});

group('реакция после разрешения: «на меня подействовали — ответить?»', () => {
  const rebukeWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      rebuke: {
        label: 'Возмездие', activation: 'passive',
        on: [{ on: 'after:strike', confirm: {}, if: { expr: '@cel == @holder and @hit.success' }, steps: [{ type: 'apply', target: { expr: '@deystvuyuschiy.hp_current' }, direction: 'subtract', value: { expr: '3' } }] }],
      },
    },
  };
  const vengeful = { ...mirra, effects: [{ effectId: 'rebuke' }] };

  const strike = (sheet: any, dice: number[], answer: (q: Question) => string[]) =>
    play(rebukeWorld, [arven, sheet], dice, answer);
  const decline = (): string[] => [];

  test('предлагается только в окне «после» и только когда попали', () => {
    const r = strike(vengeful, [9, 5], decline);
    deepEq(r.questions.map(q => q.window), ['after']);
    deepEq(ids(r.questions[0]!), ['rebuke']);

    eq(strike(vengeful, [2, 5], decline).questions.length, 0);
  });

  test('согласие даёт ответ нападавшему, и тот теряет хиты', () => {
    const r = strike(vengeful, [9, 5], q => (q.window === 'after' ? ['rebuke'] : []));
    eq(r.sheets.find(s => s.id === 'mirra')!.values.hp_current, (mirra.values.hp_current as number) - 8, 'себе возмездие ничего не делает');
    eq(r.sheets.find(s => s.id === 'arven')!.values.hp_current, (arven.values.hp_current as number) - 3);
    const reply = r.reports.find(x => x.report.effect === 'rebuke')!;
    eq(reply.fromId, 'mirra');
  });
});

group('триггер до разрешения: срабатывает молча, и чужое действие видит уже новый лист', () => {
  const braceWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      brace: {
        label: 'Стойка', activation: 'passive',
        on: [{ on: 'before:strike', if: { expr: '@cel == @holder' }, steps: [{ type: 'status', mode: 'apply', effect: 'wall', to: { expr: '@holder' } }] }],
      },
      wall: {
        label: 'Стена', activation: 'passive', duration: { kind: 'turns', max: 1 },
        modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '20' } }],
      },
    },
  };
  const braced = { ...mirra, effects: [{ effectId: 'brace' }] };

  test('атака, которая попала бы, промахивается по поднятой броне', () => {
    const plain = play(braceWorld, [arven, mirra], [9, 5]);
    ok(stepOf(plain, 'hit').success, 'без стойки попадание');

    const guarded = play(braceWorld, [arven, braced], [9, 5]);
    ok(!stepOf(guarded, 'hit').success, 'со стойкой промах');
    ok(guarded.sheets.find(s => s.id === 'mirra')!.effects.some(e => e.effectId === 'wall'));
  });
});
