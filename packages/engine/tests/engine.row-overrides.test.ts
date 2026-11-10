import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import { fieldOf } from '../src/model/sheet-columns.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'с', name: 'с',
  tables: {
    черты: {
      label: 'Черты', owner: 'sheet',
      columns: [
        { key: 'значение', label: 'Значение', kind: 'number', default: 3, min: 1, max: 9 },
        { key: 'предел', label: 'Предел', kind: 'number' },
      ],
      rows: [
        { value: 'тело', label: 'Тело', cells: { предел: 6 }, view: { значение: { max: { expr: '@строка.предел' } } } },
        { value: 'воля', label: 'Воля', cells: { предел: 6 } },
        { value: 'магия', label: 'Магия', cells: { предел: 6 }, view: { значение: { default: 2, min: 0, max: 4 } } },
      ],
    },
    приёмы: { shape: 'book', use: 'action', label: 'Приёмы', columns: [], bindings: [{ label: 'Накачка', effect: 'накачка' }] },
  },
  effects: {
    накачка: {
      label: 'Накачка', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }],
      steps: [
        { type: 'apply', target: { expr: '@действующий.черты.тело.значение' }, direction: 'add', value: { expr: '20' } },
        { type: 'apply', target: { expr: '@действующий.черты.воля.значение' }, direction: 'add', value: { expr: '20' } },
        { type: 'apply', target: { expr: '@действующий.черты.магия.значение' }, direction: 'subtract', value: { expr: '20' } },
      ],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'приём', table: 'приёмы', label: 'Приём', cells: {} }] } as unknown as Compendium;
const sheet = { id: 'я', systemId: 'с', name: 'Я', values: {}, has: [{ of: 'приём' }], effects: [] } as unknown as Sheet;

group('строка уточняет колонку: умолчание и пределы', () => {
  test('умолчание строки — на новом листе, у соседних — умолчание колонки', () => {
    eq(fieldOf(system, 'черты.магия.значение')?.value.kind === 'stored' && fieldOf(system, 'черты.магия.значение')?.value.default, 2);
    eq(fieldOf(system, 'черты.тело.значение')?.value.kind === 'stored' && fieldOf(system, 'черты.тело.значение')?.value.default, 3);
  });

  test('предел строки обрезает «Изменение», соседняя строка живёт по пределу колонки, формула с @строка считается', () => {
    const out = exchange({ system, compendium, sheets: [sheet], actionId: 'приём:0', fromId: 'я', toId: 'я', die: () => 1 });
    const values = out.sheets[0]!.values;
    eq(values['черты.тело.значение'], 6);
    eq(values['черты.воля.значение'], 9);
    eq(values['черты.магия.значение'], 0);
  });
});
