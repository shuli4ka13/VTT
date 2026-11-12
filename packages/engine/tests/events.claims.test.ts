import { group, test, eq, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

const passive = (label: string, edit: string, condition: string, tags: string[] | null = ['атака']) => ({
  label, activation: 'passive', duration: { kind: 'permanent' },
  modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', ...(tags ? { tags } : {}), edit, if: { expr: condition } }],
});

const base = {
  id: 'заявки', name: 'Заявки',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  roll_edits: {
    advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }], cancels: ['disadvantage'] },
    disadvantage: { label: 'Помеха', ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }], cancels: ['advantage'] },
  },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
      { key: 'уровень', label: 'Уровень', kind: 'number', default: 3 },
      { key: 'вдохновение', label: 'Вдохновение', kind: 'number', default: 0, min: 0 },
      { key: 'кд', label: 'КД', kind: 'number', default: 1 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }, { label: 'Яд', effect: 'яд', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        EACH,
        { id: 'бросок', type: 'roll', die: 'к20', tags: ['атака'], by: { expr: '@действующий' } },
        { id: 'попал', type: 'check', value: { expr: '@бросок' }, versus: { expr: '@цель.кд' } },
        { id: 'урон', type: 'roll', die: { expr: '1к6' } },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
    яд: {
      label: 'Ядовитый плевок', activation: 'manual', params: [ACTOR, TARGETS],
      steps: [
        EACH,
        { id: 'спас', type: 'roll', die: 'к20', tags: ['спасбросок'], by: { expr: '@цель' } },
        { type: 'check', value: { expr: '@спас' }, versus: { expr: '10' } },
      ],
    },
    отравлен: passive('Отравлен', 'disadvantage', '@бросающий == @носитель'),
  },
} as unknown as System;

const withEffects = (extra: Record<string, unknown>): System => ({ ...base, effects: { ...base.effects, ...extra } }) as System;

const compendium = { records: [{ id: 'приём', table: 'приём', label: 'Приём', cells: {} }] } as unknown as Compendium;

const make = (id: string, extra: Partial<Sheet> & { values?: Record<string, number> } = {}): Sheet =>
  ({ id, systemId: 'заявки', name: id, values: { хп: 20, уровень: 3 }, has: [{ of: 'приём' }], effects: [], ...extra } as unknown as Sheet);

const arven = make('arven');
const mirra = make('mirra');

const strike = (sys: System, from: Sheet, to: Sheet, dice: number[], claims?: { source?: string[]; target?: string[] }, actionId = 'приём:0') =>
  exchange({
    system: sys, compendium, die: queue(...dice), sheets: [from, to],
    actionId, fromId: from.id, toId: to.id, ...(claims ? { claims } : {}),
  });
const hitTrace = (r: ReturnType<typeof exchange>) => r.reports.find(x => x.report.kind === 'effect')!.report.trace[0] as any;

group('заявка правки за столом', () => {
  const attack = (claims: string[], sheet = arven, ...dice: number[]) =>
    hitTrace(strike(base, sheet, mirra, dice, { source: claims }));

  test('игрок просит преимущество — костей две, берётся лучшая, журнал называет правку', () => {
    const t = attack(['advantage'], arven, 4, 18, 5);
    deepEq(t.rolls, [4, 18]);
    eq(t.kept, 18);
    deepEq(t.edits, ['Преимущество']);
  });

  test('заявка не отменяет закон словаря: отравленный с преимуществом бросает одну кость', () => {
    const t = attack(['advantage'], make('arven', { effects: [{ effectId: 'отравлен' }] } as never), 11, 5);
    deepEq(t.rolls, [11]);
    eq(t.edits, undefined);
  });

  test('заявка на правку, которой нет в словаре, — ошибка перечисляет словарь', () => {
    throws(() => strike(base, arven, mirra, [1, 1], { source: ['котик'] }), 'котик');
  });

  test('заявка за цель: спасбросок бросается с преимуществом, считает бросающий — цель', () => {
    const r = strike(base, mirra, arven, [2, 19, 5], { target: ['advantage'] }, 'приём:1');
    const t = r.reports[0]!.report.trace[0] as any;
    deepEq(t.rolls, [2, 19]);
    eq(t.kept, 19);
  });

  test('ход целиком несёт заявку действующего', () => {
    const r = exchange({
      system: base, compendium, die: queue(4, 18, 5, 6, 6, 6, 6), sheets: [arven, mirra],
      actionId: 'приём:0', fromId: 'arven', toId: 'mirra',
      claims: { source: ['advantage'] },
    });
    deepEq((r.reports[0]!.report.trace[0] as any).rolls, [4, 18]);
  });
});

group('цель видна действующему: состояния цели правят бросок по ней', () => {
  const prone = withEffects({ лежит: passive('Лежит', 'advantage', '@против == @носитель') });
  const lying = make('mirra', { effects: [{ effectId: 'лежит' }] } as never);

  test('по лежащей цели атакуют с преимуществом — правку даёт лист ЦЕЛИ', () => {
    const t = hitTrace(strike(prone, arven, lying, [4, 18, 5]));
    deepEq(t.rolls, [4, 18]);
    eq(t.kept, 18);
  });

  test('по цели без правок бросок обычный', () => {
    deepEq(hitTrace(strike(prone, arven, mirra, [4, 5])).rolls, [4]);
  });

  test('условие правки цели считается по листу ЦЕЛИ', () => {
    const sys = withEffects({ лежит: passive('Лежит', 'advantage', '@против == @носитель и @носитель.уровень >= 5') });
    deepEq(hitTrace(strike(sys, arven, lying, [4, 5])).rolls, [4], 'у Мирры третий уровень — условие ложно');
  });

  test('правка цели гасится помехой нападающего по закону словаря', () => {
    const t = hitTrace(strike(prone, make('arven', { effects: [{ effectId: 'отравлен' }] } as never), lying, [11, 5]));
    deepEq(t.rolls, [11]);
  });

  test('«против меня» не трогает собственные броски цели', () => {
    deepEq(hitTrace(strike(prone, lying, arven, [9, 5])).rolls, [9]);
  });

  test('«против любого броска по мне» ловит и атаку', () => {
    const sys = withEffects({ дрожит: passive('Дрожит', 'advantage', '@против == @носитель', null) });
    deepEq(hitTrace(strike(sys, arven, make('mirra', { effects: [{ effectId: 'дрожит' }] } as never), [4, 18, 5])).rolls, [4, 18]);
  });

  test('ход целиком: сервер держит оба листа и подставляет цель сам', () => {
    const r = exchange({
      system: prone, compendium, die: queue(4, 18, 5, 6, 6, 6, 6), sheets: [arven, lying],
      actionId: 'приём:0', fromId: 'arven', toId: 'mirra',
    });
    deepEq((r.reports[0]!.report.trace[0] as any).rolls, [4, 18]);
  });
});

group('правка после того, как бросок увиден: выпавшее остаётся', () => {
  const luckWorld = withEffects({
    вдохновение: {
      label: 'Вдохновение: перебросить', activation: 'passive',
      on: [{
        on: 'seen', confirm: true, if: { expr: '@бросающий == @носитель и @носитель.вдохновение > 0' },
        steps: [
          { type: 'apply', target: { expr: '@носитель.вдохновение' }, direction: 'subtract', value: { expr: '1' } },
          { type: 'roll-add', count: { expr: '1' }, keep: 'best' },
        ],
      }],
    },
  });
  const inspired = make('arven', { values: { хп: 20, уровень: 3, вдохновение: 1 }, effects: [{ effectId: 'вдохновение' }] } as never);

  test('преимущество, заявленное после броска, добавляет кость, а не перебрасывает старую', () => {
    const r = exchange({
      system: luckWorld, compendium, die: queue(7, 18, 3), sheets: [inspired, mirra],
      actionId: 'приём:0', fromId: 'arven', toId: 'mirra',
      answer: q => (q.window === 'seen' ? ['вдохновение'] : []),
    });
    const main = r.reports.find(x => x.report.effect === 'удар')!.report;
    const t = main.trace[0] as any;
    deepEq(t.rolls, [7, 18], 'старая семёрка на месте, новая кость добавлена');
    eq(t.kept, 18);
    const dmg = main.trace.find((x: any) => x.step === 'урон') as any;
    deepEq(dmg.rolls, [3], 'кости урона не перебрасывались');
  });

  test('заявка стола до броска бросает обе кости сразу', () => {
    deepEq(hitTrace(strike(base, arven, mirra, [2, 18, 5], { source: ['advantage'] })).rolls, [2, 18]);
  });
});
