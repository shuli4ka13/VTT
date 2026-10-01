import { describe, it, expect } from 'vitest';
import { exchange } from './play.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

describe('имя с хозяином', () => {
  const system = {
    id: 'стороны', name: 'стороны',
    tables: { лист: { shape: 'single', columns: [
      { key: 'сила', label: 'Сила', kind: 'number' },
      { key: 'броня', label: 'Броня', kind: 'number', default: 10 },
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
    ] } , приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: {
      удар: {
        label: 'Удар', activation: 'manual',
        steps: [{
          type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false,
          value: { expr: '@отправитель.сила * 2 - @получатель.броня' },
        }],
      },
      просто: {
        label: 'Просто', activation: 'manual',
        steps: [{ type: 'emit', event: 'урон', args: { сколько: { expr: '@отправитель.сила' } } }],
      },
      урон: {
        label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@сколько + @получатель.сила' } }],
      },
      наивный: {
        label: 'Наивный', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@отправитель.сила' } }],
      },
      зовёт_наивного: {
        label: 'Зовёт', activation: 'manual',
        steps: [{ type: 'emit', event: 'наивный', args: { сколько: { const: 1 } } }],
      },
    },
    
  } as unknown as System;
  const book = {
    records: [...(['удар', 'просто', 'зовёт_наивного'].map(id => ({ id, table: 'приём', label: id, bindings: [{ label: id, effect: id, args: {} }] })))],
  } as unknown as Compendium;
  const sheet = (id: string, сила: number, броня: number): Sheet =>
    ({ id, systemId: 'стороны', name: id, values: { сила, броня, хп: 20 }, has: [{ of: 'удар' }, { of: 'просто' }, { of: 'зовёт_наивного' }], effects: [] } as unknown as Sheet);
  const hit = (action: string) => {
    const out = exchange({ system, compendium: book, die: () => 1, sheets: [sheet('бьёт', 7, 1), sheet('держит', 3, 5)], actionId: `${action}:0`, fromId: 'бьёт', toId: 'держит' });
    return out.sheets.find(x => x.id === 'держит')!.values.хп;
  };

  it('сила — у отправителя, броня — у получателя: 7·2 − 5 = 9', () => {
    expect(hit('удар')).toBe(20 - 9);
  });

  it('вызываемый эффект получает силу отправителя входом, а свою силу читает сам: 7 + 3', () => {
    expect(hit('просто')).toBe(20 - 10);
  });

  it('вызываемый эффект читает лист отправителя напрямую: действие идёт одним проходом, обоих листов', () => {
    expect(hit('зовёт_наивного')).toBe(20 - 7);
  });
});
