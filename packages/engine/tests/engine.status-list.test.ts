import { group, test, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [] },
    токсины: {
      shape: 'book', use: 'action', label: 'Токсины',
      columns: [{ key: 'яды', label: 'Что накладывает', kind: 'effect', many: true }],
      bindings: [{ label: 'Отравить', effect: 'яд', args: { что: { expr: '@яды' } } }],
    },
  },
  effects: {
    яд: {
      label: 'Яд', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'что', kind: 'effect', many: true }],
      steps: [{ type: 'status', effect: { expr: '@что' }, to: { expr: '@действующий' } }],
    },
    тошнота: { label: 'Тошнота', activation: 'passive', duration: { kind: 'permanent' } },
    слабость: { label: 'Слабость', activation: 'passive', duration: { kind: 'permanent' } },
  },
} as unknown as System;
const compendium = {
  records: [
    { id: 'два', table: 'токсины', label: 'Два', cells: { яды: ['тошнота', 'слабость'] } },
    { id: 'один', table: 'токсины', label: 'Один', cells: { яды: ['тошнота'] } },
  ],
} as unknown as Compendium;
const run = (id: string): string[] => exchange({
  system, compendium, die: () => 1, sheets: [{ id: 'я', systemId: 'x', name: 'я', values: {}, has: [{ of: id }], effects: [] } as unknown as Sheet],
  actionId: `${id}:0`, fromId: 'я', toIds: [],
}).sheets[0]!.effects!.map(e => e.effectId);

group('«Наложить» список эффектов', () => {
  test('каждый эффект списка наложен', () => {
    deepEq(run('два'), ['тошнота', 'слабость']);
    deepEq(run('один'), ['тошнота']);
  });
});
