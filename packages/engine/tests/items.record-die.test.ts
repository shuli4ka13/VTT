import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = flattenSystem({
  id: 'с', name: 'с',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'урон', label: 'Урон', kind: 'number', default: 0 }] },
    оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'удар', args: { оружие: { expr: '@item' } } }] },
  },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [
      { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
      { key: 'оружие', label: 'Оружие', kind: 'record', from: 'оружие' },
    ], steps: [
      { id: 'бросок', type: 'roll', die: { expr: '@оружие.кость' }, by: { expr: '@действующий' } },
      { type: 'apply', target: { expr: '@действующий.урон' }, direction: 'set', value: { expr: '@бросок.total' } },
    ] },
  },
} as unknown as System);

const book = { records: [
  { id: 'кинжал', table: 'оружие', label: 'Кинжал', cells: { кость: '1d4' } },
  { id: 'меч', table: 'оружие', label: 'Меч', cells: { кость: '1d8' } },
] } as unknown as Compendium;

const hero = { id: 'г', systemId: 'с', name: 'Герой', values: {}, has: [{ of: 'кинжал' }, { of: 'меч' }], effects: [] } as unknown as Sheet;

const strike = (action: string): unknown => {
  const out = perform({ system, compendium: book, clock: null, sheets: [hero], die: sides => sides }, { op: 'act', intent: { actionId: action, fromId: 'г', toIds: [] } } as never);
  if (out.kind !== 'done') throw new Error(out.kind);
  return out.sheets[0]!.values['урон'];
};

describe('кость из свойства вещи: вход «запись» заполнен «этой вещью»', () => {
  it('удар бросает «Кость урона» той вещи, на которой нажали', () => {
    expect(errorsOf(lintSystem(system, book))).toEqual([]);
    expect(strike('кинжал:0')).toBe(4);
    expect(strike('меч:0')).toBe(8);
  });
});
