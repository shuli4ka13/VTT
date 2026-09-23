import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { targets } from '../src/engine/targets.ts';
import { system, arven, mirra, compendium, sheets } from './fixtures.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const passive = (label: string, target: string, edit: string, condition: string | null = null) => {
  const incoming = target.startsWith('incoming:');
  const tag = target.replace(/^incoming:/, '');
  return {
    label, activation: 'passive', duration: { kind: 'permanent' },
    modifiers: [{
      kind: 'roll', target: incoming ? 'incoming:roll:any' : 'roll:any',
      ...(tag === 'roll:any' ? {} : { tags: [tag] }), edit, condition,
    }],
  };
};
const withEffects = (extra: Record<string, unknown>) => ({ ...system, effects: { ...system.effects, ...extra } });

group('заявка правки за столом', () => {
  const attack = (claims: string[], sheet = arven, ...dice: number[]) => {
    const env = send('longsword-item:0', { system, sheet, compendium, die: queue(...dice), claims });
    return receive(env, { system, sheet: mirra, compendium, die: queue() }).report.trace[0] as any;
  };

  test('игрок просит преимущество — костей две, берётся лучшая, журнал называет правку', () => {
    const t = attack(['advantage'], arven, 4, 18, 5);
    deepEq(t.rolls, [4, 18]);
    eq(t.kept, 18);
    deepEq(t.edits, ['Преимущество']);
  });

  test('заявка не отменяет закон словаря: отравленный с преимуществом бросает одну кость', () => {
    const t = attack(['advantage'], { ...arven, effects: [{ effectId: 'poisoned' }] }, 11, 5);
    deepEq(t.rolls, [11]);
    eq(t.edits, undefined);
  });

  test('заявка на правку, которой нет в словаре, — ошибка перечисляет словарь', () => {
    throws(() => send('longsword-item:0', {
      system, sheet: arven, compendium, die: queue(1, 1), claims: ['котик'],
    }), 'котик');
  });

  test('заявка за цель: спасбросок бросается с преимуществом, считает получатель', () => {
    const env = send('poison-spray:0', { system, sheet: mirra, compendium, die: queue(3, 4) });
    const t = receive(env, {
      system, sheet: arven, compendium, die: queue(2, 19), claims: ['advantage'],
    }).report.trace[0] as any;
    deepEq(t.rolls, [2, 19]);
    eq(t.kept, 19);
  });

  test('ход целиком несёт заявку отправителя', () => {
    const r = exchange({
      system, compendium, die: queue(4, 18, 5, 6, 6, 6, 6), sheets,
      actionId: 'longsword-item:0', fromId: 'arven', toId: 'mirra',
      claims: { source: ['advantage'] },
    });
    deepEq((r.reports[0]!.report.trace[0] as any).rolls, [4, 18]);
  });
});

group('цель видна отправителю: состояния цели правят бросок по ней', () => {
  const prone = withEffects({ prone: passive('Лежит', 'incoming:атака', 'advantage') });
  const lying = { ...mirra, effects: [{ effectId: 'prone' }] };

  test('мишень «бросок по мне» одна, вид броска уточняют метки', () => {
    ok(targets(system).some(t => t.tag === 'incoming:roll:any' && t.kind === 'roll'));
    ok(!targets(system).some(t => t.tag === 'incoming:атака'));
  });

  test('по лежащей цели атакуют с преимуществом — правку даёт лист ЦЕЛИ', () => {
    const env = send('longsword-item:0', {
      system: prone, sheet: arven, compendium, die: queue(4, 18, 5), against: lying,
    });
    deepEq(env.steps[0]!.rolled.rolls, [4, 18]);
    eq(env.steps[0]!.rolled.kept, 18);
  });

  test('без цели под рукой правок цели нет — предпросмотр на клиенте честен в своих пределах', () => {
    const env = send('longsword-item:0', { system: prone, sheet: arven, compendium, die: queue(4, 5) });
    deepEq(env.steps[0]!.rolled.rolls, [4]);
  });

  test('условие правки цели считается по листу ЦЕЛИ', () => {
    const sys = withEffects({ prone: passive('Лежит', 'incoming:атака', 'advantage', '#level >= 5') });
    const env = send('longsword-item:0', {
      system: sys, sheet: arven, compendium, die: queue(4, 5), against: { ...mirra, effects: [{ effectId: 'prone' }] },
    });
    deepEq(env.steps[0]!.rolled.rolls, [4], 'у Мирры третий уровень — условие ложно');
  });

  test('правка цели гасится помехой нападающего по закону словаря', () => {
    const env = send('longsword-item:0', {
      system: prone, sheet: { ...arven, effects: [{ effectId: 'poisoned' }] },
      compendium, die: queue(11, 5), against: lying,
    });
    deepEq(env.steps[0]!.rolled.rolls, [11]);
  });

  test('«против меня» не трогает собственные броски цели', () => {
    const armed = { ...lying, equipped: ['longsword-item'] };
    const env = send('longsword-item:0', { system: prone, sheet: armed, compendium, die: queue(9, 5) });
    deepEq(env.steps[0]!.rolled.rolls, [9]);
  });

  test('«против любого броска по мне» ловит и атаку', () => {
    const sys = withEffects({ shaken: passive('Дрожит', 'incoming:roll:any', 'advantage') });
    const env = send('longsword-item:0', {
      system: sys, sheet: arven, compendium, die: queue(4, 18, 5), against: { ...mirra, effects: [{ effectId: 'shaken' }] },
    });
    deepEq(env.steps[0]!.rolled.rolls, [4, 18]);
  });

  test('ход целиком: сервер держит оба листа и подставляет цель сам', () => {
    const r = exchange({
      system: prone, compendium, die: queue(4, 18, 5, 6, 6, 6, 6), sheets: [arven, lying],
      actionId: 'longsword-item:0', fromId: 'arven', toId: 'mirra',
    });
    deepEq((r.reports[0]!.report.trace[0] as any).rolls, [4, 18]);
  });
});

group('правка после того, как бросок увиден: выпавшее остаётся', () => {
  test('преимущество, заявленное после броска, добавляет кость, а не перебрасывает старую', () => {
    const first = send('longsword-item:0', { system, sheet: arven, compendium, die: queue(7, 3) });
    const before = first.steps[0]!.rolled;
    deepEq(before.rolls, [7]);

    const again = send('longsword-item:0', {
      system, sheet: arven, compendium, die: queue(18), claims: ['advantage'], kept: first.steps,
    });
    const after = again.steps[0]!.rolled;
    deepEq(after.rolls, [7, 18], 'старая семёрка на месте, новая кость добавлена');
    eq(after.kept, 18);
    deepEq(again.steps.find(s => s.type === 'amount')!.rolled.rolls, [3], 'кости урона не перебрасывались');
  });

  test('без сохранённых костей та же заявка бросает всё заново', () => {
    const again = send('longsword-item:0', {
      system, sheet: arven, compendium, die: queue(2, 18, 5), claims: ['advantage'],
    });
    deepEq(again.steps[0]!.rolled.rolls, [2, 18]);
  });
});
