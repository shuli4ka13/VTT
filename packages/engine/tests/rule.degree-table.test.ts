import { group, test, eq } from './harness.ts';
import { perform } from '../src/core/perform.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => () => values.shift() ?? 1;

const outcome = {
  label: 'Исход', key: 'range', columns: [{ key: 'value', label: 'исход', kind: 'text' }],
  rows: [
    { from: 1, to: 3, cells: { value: 'провал' } },
    { from: 4, to: 5, cells: { value: 'с последствием' } },
    { from: 6, to: 6, cells: { value: 'успех' } },
  ],
};

const system = (rule: Record<string, unknown>, tables: Record<string, unknown> = { outcome }) => ({
  id: 'с', name: 'с',
  constants: { кость: { label: 'Кость', kind: 'die', dice: [{ sides: 6 }], read: 'best' } },
  rolls: { действие: { label: 'Действие', die: 'кость', number: 'count', fields: [{ table: 'лист', column: 'навык', threshold: { expr: '4' } }], ...rule } },
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'навык', label: 'Навык', kind: 'number', default: 2 }] }, ...tables },
  effects: {},
} as unknown as System);

const sheet = { id: 'герой', systemId: 'с', name: 'Герой', values: {}, has: [], effects: [] } as unknown as Sheet;
const book = { records: [] } as unknown as Compendium;

const click = (sys: System, dice: number[]): string => {
  const out = perform({ system: sys, compendium: book, clock: null, sheets: [sheet], die: queue(...dice) } as never, { op: 'roll', sheetId: 'герой', tag: 'навык' } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return String(out.log.at(-1));
};

group('ступени правила броска таблицей', () => {
  test('ступень — строка таблицы по итогу броска', () => {
    const rule = system({ degrees: { table: 'outcome' } });
    eq(click(rule, [2, 5]).endsWith('· с последствием'), true);
    eq(click(rule, [6, 1]).endsWith('· успех'), true);
    eq(click(rule, [1, 3]).endsWith('· провал'), true);
  });

  test('«по степеням» — строка по разнице с порогом', () => {
    const margins = { ...outcome, rows: [
      { from: -9, to: -1, cells: { value: 'мимо' } },
      { from: 0, to: 1, cells: { value: 'впритык' } },
      { from: 2, to: 9, cells: { value: 'чисто' } },
    ] };
    const rule = system({ degrees: { table: 'outcome', of: 'margin' } }, { outcome: margins });
    eq(click(rule, [5, 1]).endsWith('· впритык'), true);
    eq(click(rule, [6, 6]).endsWith('· чисто'), true);
    eq(click(rule, [2, 1]).endsWith('· мимо'), true);
  });

  test('«Проблемы»: таблицы ступеней нет', () => {
    const found = lintSystem(system({ degrees: { table: 'нет' } }));
    eq(found.some(one => one.level === 'error' && one.text.includes('ступени берутся из таблицы «нет»')), true);
  });

  test('«Проблемы»: ступень по степеням, а степеней правило не считает', () => {
    const plain = system({ number: 'bonus', fields: [{ table: 'лист', column: 'навык' }], degrees: { table: 'outcome', of: 'margin' } });
    eq(lintSystem(plain).some(one => one.level === 'error' && one.text.includes('степеней правило не считает')), true);
  });
});
