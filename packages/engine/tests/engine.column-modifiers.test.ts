import { group, test, deepEq } from './harness.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'уровень', label: 'Уровень', kind: 'number' }] },
    навыки: {
      label: 'Навыки', owner: 'sheet',
      columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }, { key: 'база', label: 'База', kind: 'number' }],
      rows: [{ value: 'бег', cells: { база: 1 } }, { value: 'плавание', cells: { база: 2 } }],
    },
  },
  effects: {
    уровень: {
      label: 'По уровню', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'cell:навыки.*.ранг', op: 'add', value: { expr: '@уровень + @row.база' }, if: { expr: '@row != "никакой"' } }],
    },
  },
} as unknown as System;

const compendium = { records: [] } as unknown as Compendium;
const sheet = (effects: object[]): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: { уровень: 3, 'навыки.бег.ранг': 1, 'навыки.плавание.ранг': 0 }, has: [], effects } as unknown as Sheet);
const read = (s: Sheet, tag: string): unknown => calc(system, s, tag, newPass(system, s, { compendium }));

group('правка по всей колонке таблицы листа', () => {
  test('«любая строка» правит каждую живую клетку, «@row» — своя строка', () => {
    const s = sheet([{ effectId: 'уровень' }]);
    deepEq([read(s, 'навыки.бег.ранг'), read(s, 'навыки.плавание.ранг')], [5, 5]);
  });

  test('без правки — как записано', () => {
    const s = sheet([]);
    deepEq([read(s, 'навыки.бег.ранг'), read(s, 'навыки.плавание.ранг')], [1, 0]);
  });
});

group('правка по всей колонке: проверка системы', () => {
  test('«@row» в правке «любая строка» — не ошибка', () => {
    deepEq(errorsOf(lintSystem(system, compendium)).map(p => p.text), []);
  });
});

