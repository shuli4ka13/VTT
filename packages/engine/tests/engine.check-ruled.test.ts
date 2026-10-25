import { group, test, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const make = (extra: Record<string, unknown>): System => ({
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'итог', label: 'Итог', kind: 'number' }, { key: 'запас', label: 'Запас', kind: 'number' }] },
    кнопки: { shape: 'book', use: 'action', label: 'Кнопки', columns: [], bindings: [{ label: 'Проверить', effect: 'проба', args: {} }] },
  },
  effects: {
    проба: {
      label: 'Проба', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }],
      steps: [
        { id: 'п', type: 'check', value: { expr: '5' }, versus: { expr: '3' }, ...extra },
        { type: 'apply', target: { expr: '@действующий.итог' }, direction: 'set', value: { expr: 'если(@п.success, 1, 0)' } },
        { type: 'apply', target: { expr: '@действующий.запас' }, direction: 'set', value: { expr: '@п.margin' } },
      ],
    },
  },
} as unknown as System);
const compendium = { records: [{ id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} }] } as unknown as Compendium;
const me: Sheet = { id: 'я', systemId: 'x', name: 'я', values: { итог: 0, запас: 0 }, has: [{ of: 'кнопки' }], effects: [] } as unknown as Sheet;
const out = (extra: Record<string, unknown>) => {
  const v = exchange({ system: make(extra), compendium, die: () => 1, sheets: [me], actionId: 'кнопки:0', fromId: 'я', toIds: [] }).sheets[0]!.values;
  return [v.итог, v.запас];
};

group('исход проверки по правилу', () => {
  test('без правила — по числам', () => deepEq(out({}), [1, 2]));
  test('«всегда провал, если» — провал', () => deepEq(out({ failIf: { expr: 'да' } }), [0, 2]));
  test('«всегда успех с запасом» — успех с этим запасом', () => deepEq(out({ versus: { expr: '9' }, passWith: { expr: '4' } }), [1, 4]));
});
