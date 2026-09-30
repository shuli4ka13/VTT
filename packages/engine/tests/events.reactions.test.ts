import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { send, receive, offers, react, senderResults } from '../src/events/envelope.ts';
import { exchange, deliver } from '../src/events/exchange.ts';
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
      label: 'Щит', activation: 'passive', cost: 'reaction',
      on: [{ on: '*', phase: 'before', confirm: true, if: { expr: '@hit.success' }, steps: [{ type: 'status', mode: 'apply', effect: { const: 'shield_up' } }] }],
    },
    shield_up: {
      label: 'Под щитом', activation: 'passive', duration: { kind: 'turns', max: 1 },
      modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '5' }, stacking: 'sum' }],
    },
  },
};
const shielded = { ...mirra, effects: [{ effectId: 'shield' }] };

group('реакция цели: пауза перед разрешением', () => {
  const attack = (...dice: number[]) =>
    send('longsword-item:0', { system: shieldWorld, sheet: arven, compendium, die: queue(...dice) });

  test('«Щит» предлагается только когда атака попала бы — стол заранее знает исход', () => {
    const env = attack(9, 5);
    const dry = receive(env, { system: shieldWorld, sheet: shielded, compendium, die: queue() });
    const offered = offers(env, 'target', { system: shieldWorld, sheet: shielded, compendium, die: queue() }, dry.report.trace.length ? resultsOf(dry) : {});
    deepEq(offered.map(o => o.id), ['shield']);

    const miss = attack(2, 5);
    const dryMiss = receive(miss, { system: shieldWorld, sheet: shielded, compendium, die: queue() });
    eq(offers(miss, 'target', { system: shieldWorld, sheet: shielded, compendium, die: queue() }, resultsOf(dryMiss)).length, 0);
  });

  test('без реакции на листе предлагать нечего', () => {
    eq(offers(attack(9, 5), 'target', { system: shieldWorld, sheet: mirra, compendium, die: queue() }).length, 0);
  });

  test('игрок применил «Щит» — броня выросла, и та же атака промахнулась', () => {
    const env = attack(9, 5);
    const dry = receive(env, { system: shieldWorld, sheet: shielded, compendium, die: queue() });
    eq(resultsOf(dry).hit.success, true, 'без щита 15 против 14 — попадание');

    const reacted = react(['shield'], env, 'target', { system: shieldWorld, sheet: shielded, compendium, die: queue() }, resultsOf(dry));
    deepEq(reacted.sheet.effects.map(e => e.effectId), ['shield', 'shield_up']);
    eq(reacted.reports.length, 1);

    const final = deliver({
      system: shieldWorld, compendium, die: queue(), sheets: [arven, reacted.sheet],
      envelope: env, fromId: 'arven', toId: 'mirra',
    });
    eq((final.reports[0]!.report.trace[0] as any).success, false, 'та же кость, но 15 против 19');
    eq(final.sheets.find(s => s.id === 'mirra')!.values.hp_current, mirra.values.hp_current);
  });

  test('выбрать то, что не предлагалось, нельзя', () => {
    const env = attack(9, 5);
    throws(() => react(['thorns'], env, 'target', { system: shieldWorld, sheet: shielded, compendium, die: queue() }, { hit: { success: true } }), 'не предлагается');
  });

  test('реакция со счётчиком тратится', () => {
    const once: any = { ...shieldWorld, effects: { ...shieldWorld.effects, shield: { ...shieldWorld.effects.shield, duration: { kind: 'uses', max: 1 } } } };
    const sheet = { ...mirra, effects: [{ effectId: 'shield', usesLeft: 1 }] };
    const env = send('longsword-item:0', { system: once, sheet: arven, compendium, die: queue(9, 5) });
    const reacted = react(['shield'], env, 'target', { system: once, sheet, compendium, die: queue() }, { hit: { success: true } });
    deepEq(reacted.spent, ['shield']);
    deepEq(reacted.sheet.effects.map(e => e.effectId), ['shield_up']);
  });
});

group('реакция отправителя: увидел бросок — решил перебросить', () => {
  const luckWorld: any = {
    ...withColumn(system, { key: 'inspiration', label: 'Вдохновение', kind: 'number', default: 1, min: 0 }),
    effects: {
      ...system.effects,
      inspire: {
        label: 'Вдохновение: перебросить', activation: 'passive',
        on: [{ on: '*', role: 'sender', phase: 'before', confirm: true, if: { expr: '#inspiration > 0' }, claims: ['advantage'], steps: [{ type: 'apply', target: { tag: 'inspiration' }, direction: 'subtract', value: { expr: '1' } }] }],
      },
    },
  };
  const inspired = { ...arven, values: { ...arven.values, inspiration: 1 }, effects: [{ effectId: 'inspire' }] };

  test('предлагается, пока есть очко; после траты — нет', () => {
    const env = send('longsword-item:0', { system: luckWorld, sheet: inspired, compendium, die: queue(4, 5) });
    deepEq(offers(env, 'sender', { system: luckWorld, sheet: inspired, compendium, die: queue() }).map(o => o.id), ['inspire']);
    const broke = { ...inspired, values: { ...inspired.values, inspiration: 0 } };
    eq(offers(env, 'sender', { system: luckWorld, sheet: broke, compendium, die: queue() }).length, 0);
  });

  test('применил — очко потрачено, а конверт собирается заново с заявленной правкой', () => {
    const env = send('longsword-item:0', { system: luckWorld, sheet: inspired, compendium, die: queue(4, 5) });
    const reacted = react(['inspire'], env, 'sender', { system: luckWorld, sheet: inspired, compendium, die: queue() });
    eq(reacted.sheet.values.inspiration, 0);
    deepEq(reacted.claims, ['advantage']);

    const again = send('longsword-item:0', { system: luckWorld, sheet: reacted.sheet, compendium, die: queue(4, 18, 5), claims: reacted.claims });
    deepEq(again.steps[0]!.rolled.rolls, [4, 18]);
    eq(again.steps[0]!.rolled.kept, 18);
  });
});

group('подписка на исходящее: вампиризм и метка на цели', () => {
  const vampWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      vampiric: {
        label: 'Вампиризм', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'event:damage', role: 'sender', steps: [{ type: 'apply', target: { tag: 'hp_current' }, direction: 'add',
          value: { expr: 'округлить вниз(#event_amount / 2)' }, targetModifiers: false }] }],
      },
      brand: {
        label: 'Метка охотника', activation: 'passive', duration: { kind: 'permanent' },
        on: [{ on: 'fire_bolt', role: 'sender', to: 'other', if: { expr: '@hit.success' }, steps: [{ type: 'status', mode: 'apply', effect: { const: 'poisoned' } }] }],
      },
    },
  };
  const caster = { ...arven, values: { ...arven.values, hp_current: 10 }, has: [{ of: 'fire-bolt' }] };

  test('нанёс урон вызовом — сам подлечился на половину', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(15, 8, 6), sheets: [{ ...caster, effects: [{ effectId: 'vampiric' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    const dealt = r.reports[0]!.report.emitted[0]!.amount;
    ok(dealt > 0, 'урон дошёл');
    eq(r.sheets.find(s => s.id === 'arven')!.values.hp_current, 10 + Math.floor(dealt / 2));
    eq(r.reports.length, 2, 'вторая запись журнала — реакция отправителя на самого себя');
  });

  test('промах — вампиризм молчит: вызова урона не было', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(1, 8), sheets: [{ ...caster, effects: [{ effectId: 'vampiric' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    eq(r.sheets.find(s => s.id === 'arven')!.values.hp_current, 10);
    eq(r.reports.length, 1);
  });

  test('«кому: цели» — исходящий триггер шлёт цели свой конверт', () => {
    const r = exchange({
      system: vampWorld, compendium, die: queue(15, 8, 6), sheets: [{ ...caster, effects: [{ effectId: 'brand' }] }, mirra],
      actionId: 'fire-bolt:0', fromId: 'arven', toId: 'mirra',
    });
    ok(r.sheets.find(s => s.id === 'mirra')!.effects.some(e => e.effectId === 'poisoned'));
    eq(r.reports[1]!.report.reply, true);
  });
});

function resultsOf(out: ReturnType<typeof receive>): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  for (const t of out.report.trace as any[]) {
    if (t.step === undefined || typeof t.step !== 'string') continue;
    if (t.type === 'threshold') results[t.step] = { success: t.success, margin: t.margin, total: t.total };
  }
  return results;
}

group('окно «я бросил» видит факты собственного броска', () => {
  test('senderResults отдаёт итог, число костей и признаки максимума/единицы по упакованному порогу', () => {
    const envelope = {
      kind: 'effect', effect: 'x', from: 'a', action: 'x:0', label: 'x',
      steps: [
        { type: 'threshold', id: 'hit', rolled: { total: 17, rolls: [17], kept: null, edits: [], tally: { dice: 1, atMax: 0, atMin: 0 } }, bonus: { const: 5 }, modBonus: 2 },
        { type: 'threshold', id: 'save', roll: {} },
        { type: 'amount', id: 'n', rolled: null },
        { type: 'amount', id: 'dmg' },
      ],
    };
    const seen = senderResults(envelope);
    deepEq(Object.keys(seen), ['hit']);
    eq(seen.hit.total, 24);
    eq(seen.hit.rolled, 1);
    eq(seen.hit.edited, false);
    deepEq(seen.hit.parts, {});
  });

  test('senderResults несёт части броска: Надежду и Страх видно у отправителя, а не только у цели', () => {
    const seen = senderResults({
      kind: 'effect', effect: 'x', from: 'a', action: 'x:0', label: 'x',
      steps: [{ type: 'threshold', id: 'бросок', rolled: { total: 13, rolls: [9, 4], kept: null, parts: { надежда: 9, страх: 4 } }, bonus: { const: 0 } }],
    } as any);
    deepEq(seen.бросок.parts, { надежда: 9, страх: 4 });
  });
});

group('реакция после разрешения: «на меня подействовали — ответить?»', () => {
  const rebukeWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      rebuke: {
        label: 'Возмездие', activation: 'passive', cost: 'reaction',
        on: [{ on: 'strike', to: 'other', confirm: true, if: { expr: '@hit.success' }, steps: [{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { expr: '3' } }] }],
      },
    },
  };
  const vengeful = { ...mirra, effects: [{ effectId: 'rebuke' }] };
  const ctx = (sheet: any) => ({ system: rebukeWorld, sheet, compendium, die: queue() });

  test('предлагается только в окне «после» и только когда попали', () => {
    const env = send('longsword-item:0', { system: rebukeWorld, sheet: arven, compendium, die: queue(9, 5) });
    const main = receive(env, ctx(vengeful));
    eq(offers(env, 'target', ctx(vengeful), main.results, main.report.emitted).length, 0);
    deepEq(offers(env, 'after', ctx(vengeful), main.results, main.report.emitted).map(o => o.id), ['rebuke']);

    const miss = send('longsword-item:0', { system: rebukeWorld, sheet: arven, compendium, die: queue(2, 5) });
    const dry = receive(miss, ctx(vengeful));
    eq(offers(miss, 'after', ctx(vengeful), dry.results, dry.report.emitted).length, 0);
  });

  test('согласие даёт ответный конверт нападавшему, и тот теряет хиты', () => {
    const env = send('longsword-item:0', { system: rebukeWorld, sheet: arven, compendium, die: queue(9, 5) });
    const main = receive(env, ctx(vengeful));
    const reacted = react(['rebuke'], env, 'after', ctx(vengeful), main.results, main.report.emitted);
    eq(reacted.reports.length, 0, 'на себе ничего не делает');
    eq(reacted.replies.length, 1);
    eq(reacted.replies[0]!.to, 'arven');
    const back = receive(reacted.replies[0]!, ctx(arven));
    eq(back.sheet.values.hp_current, (arven.values.hp_current as number) - 3);
  });
});

group('триггер до разрешения: срабатывает молча, и чужое действие видит уже новый лист', () => {
  const braceWorld: any = {
    ...system,
    effects: {
      ...system.effects,
      brace: {
        label: 'Стойка', activation: 'passive',
        on: [{ on: 'strike', phase: 'before', steps: [{ type: 'status', mode: 'apply', effect: { const: 'wall' } }] }],
      },
      wall: {
        label: 'Стена', activation: 'passive', duration: { kind: 'turns', max: 1 },
        modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '20' }, stacking: 'sum' }],
      },
    },
  };
  const braced = { ...mirra, effects: [{ effectId: 'brace' }] };

  test('атака, которая попала бы, промахивается по поднятой броне', () => {
    const attack = () => send('longsword-item:0', { system: braceWorld, sheet: arven, compendium, die: queue(9, 5) });
    const plain = receive(attack(), { system: braceWorld, sheet: mirra, compendium, die: queue() });
    ok((resultsOf(plain).hit as { success: boolean }).success, 'без стойки попадание');

    const guarded = receive(attack(), { system: braceWorld, sheet: braced, compendium, die: queue() });
    eq(guarded.report.reactions?.length, 1);
    eq(guarded.report.reactions![0]!.effect, 'brace');
    ok(!(resultsOf(guarded).hit as { success: boolean }).success, 'со стойкой промах');
    ok(guarded.sheet.effects.some(e => e.effectId === 'wall'));
  });
});
