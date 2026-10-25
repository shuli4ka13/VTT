import { group, test, eq, deepEq, ok } from './harness.ts';
import { availableActions, actionOf } from '../src/events/actions.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }] },
    сроки: {
      label: 'Сроки',
      columns: [{ key: 'держится', label: 'Держится', kind: 'boolean', default: false }],
      rows: [{ value: 'М', cells: {} }, { value: 'Д', cells: { держится: true } }],
    },
    чары: {
      shape: 'book', use: 'action', label: 'Чары',
      columns: [{ key: 'срок', label: 'Срок', kind: 'choice', from: 'сроки' }],
      bindings: [
        { label: 'Сотворить', effect: 'пусто', args: {} },
        { label: 'Прекратить', effect: 'пусто', args: {}, if: { expr: '@срок.держится' } },
      ],
    },
  },
  effects: { пусто: { label: 'Пусто', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }], steps: [] } },
} as unknown as System;

const compendium = {
  records: [
    { id: 'удар', table: 'чары', label: 'Удар', cells: { срок: 'М' } },
    { id: 'щит', table: 'чары', label: 'Щит', cells: { срок: 'Д' } },
  ],
} as unknown as Compendium;
const me: Sheet = { id: 'я', systemId: 'x', name: 'я', values: {}, has: [{ of: 'удар' }, { of: 'щит' }], effects: [] } as unknown as Sheet;

group('кнопка с условием по записи', () => {
  test('ложное условие — кнопки нет, номера остальных не съезжают', () => {
    deepEq(availableActions(me, { system, compendium }).map(a => a.id), ['удар:0', 'щит:0', 'щит:1']);
  });

  test('по скрытой кнопке действие не найти', () => {
    let text = '';
    try { actionOf('удар:1', { system, compendium }); } catch (err) { text = (err as Error).message; }
    ok(text.includes('этой кнопки нет'));
    eq(actionOf('щит:1', { system, compendium }).binding.label, 'Прекратить');
  });
});
