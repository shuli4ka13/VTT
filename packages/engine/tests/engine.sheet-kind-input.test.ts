import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'служб', label: 'Службы', kind: 'number' }] },
    кнопки: { shape: 'book', use: 'action', label: 'Кнопки', columns: [], bindings: [{ label: 'Призвать', effect: 'призыв', args: {} }] },
  },
  sheets: { маг: { label: 'Маг' }, дух: { label: 'Дух' }, огненный: { label: 'Дух огня', extends: 'дух' } },
  effects: {
    призыв: {
      label: 'Призыв', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, from: 'дух', item: { key: 'цель' } }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.служб' }, direction: 'add', value: { expr: '1' } }],
    },
  },
} as unknown as System;
const compendium = { records: [{ id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, of: string): Sheet => ({ id, of, systemId: 'x', name: id, values: { служб: 0 }, has: [{ of: 'кнопки' }], effects: [] } as unknown as Sheet);
const cast = (target: Sheet) => exchange({ system, compendium, die: () => 1, sheets: [sheet('я', 'маг'), target], actionId: 'кнопки:0', fromId: 'я', toIds: [target.id] });

group('вход-лист с требованием типа листа', () => {
  test('лист нужного типа и его наследник — подходят', () => {
    eq(cast(sheet('д', 'дух')).sheets[1]!.values.служб, 1);
    eq(cast(sheet('о', 'огненный')).sheets[1]!.values.служб, 1);
  });

  test('чужой тип листа — отказ', () => {
    let text = '';
    try { cast(sheet('в', 'маг')); } catch (err) { text = (err as Error).message; }
    ok(text.includes('нужен лист «Дух»'));
  });
});
