import { group, test, eq, throws } from './harness.ts';
import { runSteps } from './kit.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  effects: {},
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'травма', label: 'Травма', kind: 'text' },
  ] },
    травмы: {
      label: 'Травмы', key: 'range', columns: [{ key: 'value', label: 'травма', kind: 'text' }],
      rows: [
        { from: 2, to: 4, cells: { value: 'синяк' } },
        { from: 5, to: 9, cells: { value: 'перелом' } },
        { from: 10, to: 12, cells: { value: 'потеря глаза' } },
      ],
    },
    сложность: {
      label: 'Сложность по дистанции', key: 'range', columns: [{ key: 'value', label: 'значение', kind: 'number' }],
      rows: [{ from: 0, to: 6, cells: { value: 13 } }, { from: 7, to: 12, cells: { value: 15 } }, { from: 13, to: 50, cells: { value: 20 } }],
    },
  },
} as unknown as System;

const sheet = { id: 'а', systemId: 'x', name: 'А', values: { хиты: 20 }, has: [], effects: [] } as unknown as Sheet;
const compendium = { records: [] };

const exec = (steps: object[], rolls: number[], params: Record<string, unknown> = {}, paramDefs: object[] = []) => {
  let at = 0;
  const die = () => rolls[at++] ?? 1;
  const ran = runSteps(system, [sheet], sheet.id, steps as never, die, params, paramDefs as never, compendium as never);
  return { results: ran.results, trace: ran.sink.trace, sheet: ran.sheets.find(s => s.id === sheet.id)! };
};

const run = (steps: object[], rolls: number[] = []) => exec(steps, rolls);

group('шаг «таблица»', () => {
  test('бросок 2к6 читается строкой таблицы и попадает в поле', () => {
    const out = run([
      { id: 'исход', type: 'table', table: { const: 'травмы' }, dice: { const: '2d6' } },
      { type: 'apply', target: { expr: '@носитель.травма' }, direction: 'set', value: { expr: '@исход' } },
    ], [6, 6]);
    eq(out.results.исход, 'потеря глаза');
    eq(out.sheet.values.травма, 'потеря глаза');
    eq((out.trace[0] as { rolls: number[] }).rolls.join(','), '6,6');
  });

  test('без костей читается по числу — дистанция даёт сложность', () => {
    const out = run([{ id: 'порог', type: 'table', table: { const: 'сложность' }, value: { expr: '9' } }]);
    eq(out.results.порог, 15);
  });

  test('имя таблицы приходит и параметром', () => {
    const out = exec(
      [{ id: 'итог', type: 'table', table: { param: 'какая' }, value: { expr: '3' } }],
      [], { какая: 'травмы' }, [{ key: 'какая', label: 'Какая таблица', kind: 'choice' }],
    );
    eq(out.results.итог, 'синяк');
  });

  test('таблицы нет, аргумента нет, число вне диапазонов — внятные отказы', () => {
    throws(() => run([{ type: 'table', table: { const: 'нет_такой' }, value: { expr: '1' } }]), 'нет_такой');
    throws(() => run([{ type: 'table', table: { const: 'травмы' } }]), 'нужен аргумент');
    throws(() => run([{ type: 'table' }]), 'какую таблицу');
    throws(() => run([{ type: 'table', table: { const: 'травмы' }, value: { expr: '99' } }]), 'не попадает');
  });
});
