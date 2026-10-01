import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import { withColumn } from '../src/model/sheet-columns.ts';
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
      ...(tag === 'roll:any' ? {} : { tags: [tag] }), edit, ...(condition ? { condition: { expr: condition } } : {}),
    }],
  };
};
const withEffects = (extra: Record<string, unknown>) => ({ ...system, effects: { ...system.effects, ...extra } });

const strike = (sys: any, from: any, to: any, dice: number[], claims?: { source?: string[]; target?: string[] }) =>
  exchange({
    system: sys, compendium, die: queue(...dice), sheets: [from, to],
    actionId: 'longsword-item:0', fromId: from.id, toId: to.id, ...(claims ? { claims } : {}),
  });
const hitTrace = (r: ReturnType<typeof exchange>) => r.reports[0]!.report.trace[0] as any;

group('заявка правки за столом', () => {
  const attack = (claims: string[], sheet = arven, ...dice: number[]) =>
    hitTrace(strike(system, sheet, mirra, dice, { source: claims }));

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
    throws(() => strike(system, arven, mirra, [1, 1], { source: ['котик'] }), 'котик');
  });

  test('заявка за цель: спасбросок бросается с преимуществом, считает получатель', () => {
    const r = exchange({
      system, compendium, die: queue(3, 4, 2, 19, 5, 5, 5), sheets: [mirra, arven],
      actionId: 'poison-spray:0', fromId: 'mirra', toId: 'arven', claims: { target: ['advantage'] },
    });
    const t = r.reports[0]!.report.trace[0] as any;
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
    const t = hitTrace(strike(prone, arven, lying, [4, 18, 5]));
    deepEq(t.rolls, [4, 18]);
    eq(t.kept, 18);
  });

  test('по цели без правок бросок обычный', () => {
    deepEq(hitTrace(strike(prone, arven, mirra, [4, 5])).rolls, [4]);
  });

  test('условие правки цели считается по листу ЦЕЛИ', () => {
    const sys = withEffects({ prone: passive('Лежит', 'incoming:атака', 'advantage', '#level >= 5') });
    deepEq(hitTrace(strike(sys, arven, { ...mirra, effects: [{ effectId: 'prone' }] }, [4, 5])).rolls, [4], 'у Мирры третий уровень — условие ложно');
  });

  test('правка цели гасится помехой нападающего по закону словаря', () => {
    const t = hitTrace(strike(prone, { ...arven, effects: [{ effectId: 'poisoned' }] }, lying, [11, 5]));
    deepEq(t.rolls, [11]);
  });

  test('«против меня» не трогает собственные броски цели', () => {
    const armed = { ...lying, has: [{ of: 'longsword-item' }] };
    deepEq(hitTrace(strike(prone, armed, arven, [9, 5])).rolls, [9]);
  });

  test('«против любого броска по мне» ловит и атаку', () => {
    const sys = withEffects({ shaken: passive('Дрожит', 'incoming:roll:any', 'advantage') });
    deepEq(hitTrace(strike(sys, arven, { ...mirra, effects: [{ effectId: 'shaken' }] }, [4, 18, 5])).rolls, [4, 18]);
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
  const luckWorld: any = {
    ...withColumn(system, { key: 'inspiration', label: 'Вдохновение', kind: 'number', default: 1, min: 0 }),
    effects: {
      ...system.effects,
      inspire: {
        label: 'Вдохновение: перебросить', activation: 'passive',
        on: [{ on: 'acting', confirm: true, if: { expr: '#inspiration > 0' }, claims: ['advantage'], steps: [{ type: 'apply', target: { tag: 'inspiration' }, direction: 'subtract', value: { expr: '1' } }] }],
      },
    },
  };
  const inspired = { ...arven, values: { ...arven.values, inspiration: 1 }, effects: [{ effectId: 'inspire' }] };

  test('преимущество, заявленное после броска, добавляет кость, а не перебрасывает старую', () => {
    const r = exchange({
      system: luckWorld, compendium, die: queue(7, 18, 3), sheets: [inspired, mirra],
      actionId: 'longsword-item:0', fromId: 'arven', toId: 'mirra',
      answer: q => (q.window === 'sender' ? ['inspire'] : []),
    });
    const main = r.reports.find(x => x.report.effect === 'strike')!.report;
    const t = main.trace[0] as any;
    deepEq(t.rolls, [7, 18], 'старая семёрка на месте, новая кость добавлена');
    eq(t.kept, 18);
    const dmg = main.trace.find((x: any) => x.type === 'amount') as any;
    deepEq(dmg.rolls, [3], 'кости урона не перебрасывались');
  });

  test('без сохранённых костей та же заявка бросает всё заново', () => {
    deepEq(hitTrace(strike(system, arven, mirra, [2, 18, 5], { source: ['advantage'] })).rolls, [2, 18]);
  });
});
