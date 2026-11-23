import { group, test, eq, deepEq } from './harness.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }] },
    кнопки: { shape: 'book', use: 'action', label: 'Кнопки', columns: [], bindings: [{ label: 'Отметить', effect: 'метка', args: {} }] },
  },
  effects: {
    метка: {
      label: 'Метка', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
      steps: [{ type: 'apply', target: { expr: '@действующий.счёт' }, direction: 'add', value: { expr: 'if(@стол.бой, 10, 1)' } }],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} }] } as unknown as Compendium;
const me: Sheet = { id: 'я', systemId: 'x', name: 'я', values: { счёт: 0 }, has: [{ of: 'кнопки' }], effects: [] } as unknown as Sheet;

group('«@стол.бой» — идёт ли бой', () => {
  test('вне боя — нет', () => {
    eq(exchange({ system, compendium, die: () => 1, sheets: [me], actionId: 'кнопки:0', fromId: 'я', toIds: [] }).sheets[0]!.values.счёт, 1);
  });

  test('в бою — да', () => {
    const started = perform({ system, compendium, clock: null, sheets: [me], die: () => 1 }, { op: 'turn', turn: 'start', order: ['я'] } as never);
    eq(started.kind, 'done');
    const out = exchange({ system, compendium, die: () => 1, sheets: started.sheets, clock: (started as { clock: never }).clock, actionId: 'кнопки:0', fromId: 'я', toIds: [] });
    eq(out.sheets[0]!.values.счёт, 10);
  });

  test('не ошибка «Проблем»', () => {
    deepEq(errorsOf(lintSystem(system, compendium)).map(p => p.text), []);
  });
});
