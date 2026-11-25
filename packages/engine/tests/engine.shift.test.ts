import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass, shiftOf } from '../src/engine/calc.ts';

const system = {
  effects: {},
  tables: {
    list: { shape: 'single', owner: 'sheet', columns: [{ key: 'humanity', kind: 'number', default: 60 }, { key: 'empathy', expr: { expr: 'floor(@humanity / 10)' } }, { key: 'calm_on', kind: 'boolean', default: false }] },
    implants: {
      label: 'Импланты', shape: 'book', use: 'item',
      columns: [{ key: 'x', kind: 'number' }],
      modifiers: [{ kind: 'value', target: 'humanity', op: 'add', value: { expr: '-@row.x' } }],
    },
    double: {
      label: 'Удвоение', shape: 'book', use: 'item',
      modifiers: [{ kind: 'value', target: 'humanity', op: 'mul', value: { expr: '2' } }],
    },
    calm: {
      label: 'Спокойствие', shape: 'book', use: 'item',
      modifiers: [{ kind: 'value', target: 'humanity', op: 'add', value: { expr: '5' }, if: { expr: '@calm_on' } }],
    },
  },
} as never;

const book = {
  records: [
    { id: 'a', table: 'implants', label: 'ААА', cells: { x: 10 } },
    { id: 'b', table: 'implants', label: 'БББ', cells: { x: 5 } },
    { id: 'c', table: 'calm', label: 'Тишина' },
    { id: 'd', table: 'double', label: 'Дубль' },
  ],
} as never;

const sheet = (has: unknown[]) => ({ id: 's', values: { humanity: 60 }, has, effects: [] }) as never;
const passOf = (has: unknown[]) => newPass(system, sheet(has), { compendium: book });

group('сдвиг хранимого поля правками', () => {
  test('без действующих правок сдвига нет', () => {
    eq(shiftOf(system, 'humanity', passOf([])), null);
  });

  test('надетый имплант: основа 60, итог 50, источник назван', () => {
    deepEq(shiftOf(system, 'humanity', passOf([{ of: 'a' }])), { base: 60, total: 50, from: [{ label: 'Импланты', count: 1 }], additive: true });
  });

  test('итог сдвига тот же, что считает расчёт, и формулы читают итог', () => {
    const pass = passOf([{ of: 'a' }, { of: 'b' }]);
    eq(shiftOf(system, 'humanity', pass)!.total, calc(system, sheet([{ of: 'a' }, { of: 'b' }]), 'humanity', pass));
    eq(calc(system, sheet([{ of: 'a' }, { of: 'b' }]), 'empathy', pass), 4);
  });

  test('два импланта одного типа — один источник «×2»', () => {
    deepEq(shiftOf(system, 'humanity', passOf([{ of: 'a' }, { of: 'b' }]))!.from, [{ label: 'Импланты', count: 2 }]);
  });

  test('правка-множитель: итог считается, но сдвиг не обратим простым переносом — признак «только прибавки» снят', () => {
    const shift = shiftOf(system, 'humanity', passOf([{ of: 'a' }, { of: 'd' }]))!;
    eq(shift.additive, false);
    eq(shift.total, calc(system, sheet([{ of: 'a' }, { of: 'd' }]), 'humanity', passOf([{ of: 'a' }, { of: 'd' }])));
  });

  test('снятая вещь не сдвигает', () => {
    eq(shiftOf(system, 'humanity', passOf([{ of: 'a', off: true }])), null);
  });

  test('правка, чьё условие не выполнено, не считается источником', () => {
    eq(shiftOf(system, 'humanity', passOf([{ of: 'c' }])), null);
  });

  test('у поля-формулы сдвига нет: оно и так показывает итог', () => {
    eq(shiftOf(system, 'empathy', passOf([{ of: 'a' }])), null);
  });
});
