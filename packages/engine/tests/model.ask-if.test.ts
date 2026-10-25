import { group, test, deepEq } from './harness.ts';
import { asksOf } from '../src/model/asks.ts';
import type { System, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [] },
    защиты: { label: 'Защиты', columns: [{ key: 'ведущий', label: 'Порог от ведущего', kind: 'boolean', default: false }], rows: [{ value: 'порог', cells: { ведущий: true } }, { value: 'воля', cells: {} }] },
    чары: {
      shape: 'book', use: 'action', label: 'Чары', columns: [],
      bindings: [
        { label: 'По области', effect: 'колдовать', args: { область: { expr: 'да' }, защита: { expr: '"воля"' } } },
        { label: 'В одного', effect: 'колдовать', args: { область: { expr: 'нет' }, защита: { expr: '"порог"' } } },
      ],
    },
  },
  effects: {
    колдовать: {
      label: 'Колдовать', activation: 'manual',
      params: [
        { key: 'действующий', kind: 'sheet' }, { key: 'область', kind: 'boolean', default: false },
        { key: 'защита', kind: 'choice', from: 'защиты' },
        { key: 'расширение', kind: 'number', default: 0, ask: { by: 'actor', if: { expr: '@область' } } },
        { key: 'порог', kind: 'number', default: 0, ask: { by: 'gm', if: { expr: '@защита.ведущий' } } },
      ],
      steps: [],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'чары', table: 'чары', label: 'Чары', cells: {} }] } as unknown as Compendium;

group('вопрос по условию', () => {
  test('спрашивают только то, чьё условие верно', () => {
    deepEq(asksOf('чары:0', { system, compendium }).map(p => p.key), ['расширение']);
    deepEq(asksOf('чары:1', { system, compendium }).map(p => p.key), ['порог']);
  });
});
