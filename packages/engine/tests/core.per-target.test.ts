import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'с', name: 'с',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
    кольца: { label: 'Кольца', key: 'word', columns: [{ key: 'урон', label: 'Урон', kind: 'number' }], rows: [
      { value: 'эпицентр', cells: { урон: 6 } }, { value: 'близко', cells: { урон: 2 } },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Взрыв', effect: 'взрыв' }] },
  },
  effects: {
    взрыв: { label: 'Взрыв', activation: 'manual', params: [
      { key: 'действующий', kind: 'sheet' },
      { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } },
      { key: 'кольцо', label: 'Где цель', kind: 'choice', from: 'кольца', perTarget: true, ask: { by: 'actor' } },
    ], steps: [
      { type: 'each', of: 'цели' },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@кольцо.урон' } },
    ] },
  },
} as unknown as System;

const book = { records: [{ id: 'взрыв', table: 'приём', label: 'Взрыв', cells: {} }] } as unknown as Compendium;
const sheet = (id: string): Sheet => ({ id, systemId: 'с', name: id, values: {}, has: [{ of: 'взрыв' }], effects: [] } as unknown as Sheet);
const blast = (inputs: Record<string, unknown>) => perform(
  { system, compendium: book, clock: null, sheets: [sheet('я'), sheet('а'), sheet('б')], die: () => 1 },
  { op: 'act', intent: { actionId: 'взрыв:0', fromId: 'я', toIds: ['а', 'б'], inputs } } as never,
);

describe('вход «для каждой цели»: своё значение у каждой цели', () => {
  it('эпицентр и «близко» дают разный урон одним действием', () => {
    const out = blast({ кольцо: { а: 'эпицентр', б: 'близко' } });
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets.map(one => one.values['хп'])).toEqual([undefined, 4, 8]);
  });

  it('не задано для одной из целей — отказ словами', () => {
    expect(() => blast({ кольцо: { а: 'эпицентр' } })).toThrow(/Где цель \(б\)/);
  });

  it('значение для листа, который не цель, — отказ', () => {
    expect(() => blast({ кольцо: { а: 'эпицентр', б: 'близко', я: 'близко' } })).toThrow(/не цель/);
  });
});
