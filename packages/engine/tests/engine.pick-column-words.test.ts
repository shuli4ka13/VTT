import { group, test, eq, deepEq } from './harness.ts';
import { Views } from '../src/core/view.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    навыки: {
      shape: 'rows', owner: 'sheet', label: 'Навыки',
      columns: [{ key: 'ранг', label: 'Ранг', kind: 'number', default: 0 }],
      rows: [{ value: 'ближний бой' }, { value: 'стрельба' }],
    },
    заготовки: {
      shape: 'rows', label: 'Заготовки',
      columns: [{ key: 'ближний_бой', label: 'Ближний бой', kind: 'number', default: 0 }, { key: 'стрельба', label: 'Стрельба', kind: 'number', default: 0 }],
      rows: [{ value: 'громила', cells: { ближний_бой: 4, стрельба: 2 } }],
    },
    лист: {
      shape: 'single',
      columns: [
        { key: 'заготовка', label: 'Заготовка', kind: 'choice', from: 'заготовки' },
        { key: 'по_тексту', label: 'По тексту', kind: 'number', expr: { expr: '@заготовка.["ближний бой"]' } },
        { key: 'по_адресу', label: 'По адресу', kind: 'number', expr: { expr: '@заготовки.громила.["ближний бой"]' } },
      ],
    },
  },
  sheets: {
    пешка: {
      label: 'Пешка',
      modifiers: [{ kind: 'value', target: 'cell:навыки.*.ранг', op: 'set', value: { expr: '@заготовка.[@строка]' }, if: { expr: 'not empty(@заготовка)' } }],
    },
  },
  effects: {},
} as unknown as System;
const compendium = { records: [] } as unknown as Compendium;
const pawn = { id: 'п', systemId: 'x', of: 'пешка', name: 'п', values: { заготовка: 'громила' }, has: [], effects: [] } as unknown as Sheet;
const view = () => new Views(system, compendium).of([pawn], 'п');

group('колонка по тексту: «два слова» находит колонку «два_слова», как строку', () => {
  test('формула с текстом в скобках — через поле и по адресу строки', () => {
    deepEq([view().resolve('по_тексту'), view().resolve('по_адресу')], [4, 4]);
  });

  test('правка по колонке берёт клетку заготовки по имени строки', () => {
    deepEq([view().resolve('навыки.ближний_бой.ранг'), view().resolve('навыки.стрельба.ранг')], [4, 2]);
  });

  test('не ошибка «Проблем»', () => {
    eq(errorsOf(lintSystem(system, compendium)).map(p => p.text).join('\n'), '');
  });
});
