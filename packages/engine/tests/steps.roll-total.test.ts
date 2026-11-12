import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

const build = (steps: unknown[], effects: Record<string, unknown> = {}) => ({
  id: 'с', name: 'с',
  constants: {
    к6: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] },
    к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] },
  },
  roll_edits: { advantage: { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 100 }] },
    приём: { shape: 'book', use: 'action', label: 'Приём' },
  },
  effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps }, ...effects },
} as unknown as System);

const book = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
const sheet = (id: string, effects: unknown[] = []): Sheet => ({ id, systemId: 'с', name: id, values: {}, has: [{ of: 'удар' }], effects } as unknown as Sheet);
const queue = (...values: number[]) => () => values.shift() ?? 1;

const lost = (system: System, dice: number[], hero: Sheet = sheet('боец')): number => {
  const out = exchange({
    system, compendium: book, die: queue(...dice), sheets: [hero, sheet('враг')],
    actionId: 'удар:0', fromId: 'боец', toId: 'враг',
  } as never);
  return 100 - (out.sheets.find(one => one.id === 'враг')!.values as Record<string, number>).хп;
};

const hit = (value: string) => ({ type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: value } });

group('«сколько вышло всего» — итог броска с точкой', () => {
  test('бросок без бросающего до цикла, прочитанный только по итогу, считается', () => {
    eq(lost(build([{ id: 'урон', type: 'roll', die: 'к6', bonus: { expr: '2' } }, EACH, hit('@урон.total')]), [4]), 6);
  });

  test('бросок без бросающего в теле, прочитанный только по итогу, считается', () => {
    eq(lost(build([EACH, { id: 'урон', type: 'roll', die: 'к6', bonus: { expr: '2' } }, hit('@урон.total')]), [5]), 7);
  });

  test('расчёт без кости: имя и итог — одно число', () => {
    eq(lost(build([EACH, { id: 'урон', type: 'roll', fixed: { expr: '3 + 4' } }, hit('@урон.total + @урон')]), []), 14);
  });

  test('имя броска и его итог равны при прибавке шага', () => {
    const steps = [EACH, { id: 'удар', type: 'roll', die: 'к20', bonus: { expr: '3' }, by: { expr: '@действующий' } }, hit('если(@удар == @удар.total, @удар.total, 0)')];
    eq(lost(build(steps), [11]), 14);
  });

  test('имя броска и его итог равны под преимуществом и прибавкой правкой', () => {
    const effects = {
      везение: { label: 'Везение', activation: 'passive', modifiers: [
        { kind: 'edit', call: 'roll', param: 'edits', edit: 'advantage', if: { expr: '@бросающий == @носитель' } },
        { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '2' }, if: { expr: '@бросающий == @носитель' } },
      ] },
    };
    const steps = [EACH, { id: 'удар', type: 'roll', die: 'к20', by: { expr: '@действующий' } }, hit('если(@удар == @удар.total, @удар.total, 0)')];
    eq(lost(build(steps, effects), [4, 17], sheet('боец', [{ effectId: 'везение' }])), 19);
  });
});

group('«Проблемы»: у броска костей выбирают итог', () => {
  const warns = (steps: unknown[], effects: Record<string, unknown> = {}): string[] =>
    lintSystem(build(steps, effects)).filter(one => one.level === 'warn').map(one => one.text);
  const unpicked = (texts: string[]): number => texts.filter(text => text.includes('не выбран итог')).length;
  const ROLL = { id: 'урон', type: 'roll', die: 'к6', by: { expr: '@действующий' } };

  test('имя броска костей в числе — замечание, итог после точки — чисто', () => {
    eq(unpicked(warns([EACH, ROLL, hit('@урон + 1')])), 1);
    eq(unpicked(warns([EACH, ROLL, hit('@урон.total + 1')])), 0);
    eq(unpicked(warns([EACH, ROLL, hit('@урон.natural')])), 0);
  });

  test('расчёт без кости — само число, замечания нет', () => {
    eq(unpicked(warns([EACH, { id: 'урон', type: 'roll', fixed: { expr: '3' } }, hit('@урон')])), 0);
  });

  test('бросок целиком на стороне сравнения — чисто; одним итогом — замечание', () => {
    const check = (value: string) => ({ id: 'попал', type: 'check', value: { expr: value }, versus: { expr: '10' } });
    eq(unpicked(warns([EACH, ROLL, check('@урон')])), 0);
    eq(warns([EACH, ROLL, check('@урон.total')]).filter(text => text.includes('сравнивается одним итогом')).length, 1);
    eq(unpicked(warns([EACH, ROLL, check('@урон + 2')])), 1);
  });

  test('бросок целиком во вход-бросок вызова — чисто, в числовой вход — замечание', () => {
    const effects = { приём: { label: 'Приём', activation: 'manual', params: [{ key: 'бросок', kind: 'roll' }, { key: 'сколько', kind: 'number' }], steps: [] } };
    const call = (args: Record<string, unknown>) => ({ type: 'emit', effect: 'приём', args });
    eq(unpicked(warns([EACH, ROLL, call({ бросок: { expr: '@урон' } })], effects)), 0);
    eq(unpicked(warns([EACH, ROLL, call({ сколько: { expr: '@урон' } })], effects)), 1);
  });

  test('итог эффекта по имени броска — замечание', () => {
    const system = build([ROLL]);
    (system.effects.удар as unknown as { returns: unknown[] }).returns = [{ key: 'вышло', kind: 'number', expr: { expr: '@урон' } }];
    eq(lintSystem(system).filter(one => one.text.includes('не выбран итог')).length, 1);
  });
});

group('«Проблемы»: итог броска — края', () => {
  const warns = (system: System): string[] => lintSystem(system).filter(one => one.level === 'warn').map(one => one.text);
  const ROLL = { id: 'урон', type: 'roll', die: 'к6', by: { expr: '@действующий' } };

  test('вызов эффекта, заданного формулой: бросок целиком в аргументе не тревожит', () => {
    const steps = [EACH, ROLL, { type: 'emit', effect: { expr: '@приём' }, args: { бросок: { expr: '@урон' } } }];
    eq(warns(build(steps)).filter(text => text.includes('не выбран итог')).length, 0);
  });

  test('общий бросок внутри формулы сравнения — одно замечание, не два', () => {
    const shared = { id: 'удар', type: 'roll', die: 'к20', by: { expr: '@действующий' } };
    const steps = [shared, EACH, { id: 'попал', type: 'check', value: { expr: '@удар + 1' }, versus: { expr: '10' } }];
    const texts = warns(build(steps)).filter(text => text.includes('«удар»'));
    eq(texts.length, 1, texts.join('|'));
  });

  test('общий бросок, прочитанный итогом мимо сравнения, — замечание про цель, а не про итог', () => {
    const shared = { id: 'удар', type: 'roll', die: 'к20', by: { expr: '@действующий' } };
    const steps = [shared, EACH, { id: 'попал', type: 'check', value: { expr: '@удар' }, versus: { expr: '10' } }, hit('@удар.total')];
    const texts = warns(build(steps)).filter(text => text.includes('«удар»'));
    eq(texts.length, 1, texts.join('|'));
    eq(texts[0]!.includes('общий бросок без правок цели'), true);
  });

  test('итог эффекта называет свою колонку', () => {
    const system = build([ROLL]);
    (system.effects.удар as unknown as { returns: unknown[] }).returns = [{ key: 'вышло', kind: 'number', expr: { expr: '@урон' } }];
    eq(lintSystem(system).find(one => one.text.includes('не выбран итог'))?.where.key, 'вышло');
  });
});
