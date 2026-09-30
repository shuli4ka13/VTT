import { describe, it, expect } from 'vitest';
import { send, receive } from '../src/events/envelope.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

describe('имя с хозяином', () => {
  const system = {
    id: 'стороны', name: 'стороны',
    tables: { лист: { shape: 'single', columns: [
      { key: 'сила', label: 'Сила', kind: 'number' },
      { key: 'броня', label: 'Броня', kind: 'number', default: 10 },
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
    ] } },
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
    records: { приём: { kind: 'action', label: 'Приём' } },
  } as unknown as System;
  const book = {
    records: [...(['удар', 'просто', 'зовёт_наивного'].map(id => ({ id, rk: 'приём', label: id, bindings: [{ label: id, effect: id, args: {} }] })))],
  } as unknown as Compendium;
  const sheet = (id: string, сила: number, броня: number): Sheet =>
    ({ id, systemId: 'стороны', name: id, values: { сила, броня, хп: 20 }, has: [{ of: 'удар' }, { of: 'просто' }, { of: 'зовёт_наивного' }], effects: [] } as unknown as Sheet);
  const hit = (action: string) => {
    const env = send(`${action}:0`, { system, sheet: sheet('бьёт', 7, 1), compendium: book, die: () => 1 });
    return receive(env, { system, sheet: sheet('держит', 3, 5), compendium: book, die: () => 1 }).sheet.values.хп;
  };

  it('сила — у отправителя, броня — у получателя: 7·2 − 5 = 9', () => {
    expect(hit('удар')).toBe(20 - 9);
  });

  it('вызываемый эффект получает силу отправителя входом, а свою силу читает сам: 7 + 3', () => {
    expect(hit('просто')).toBe(20 - 10);
  });

  it('вызываемый эффект не может тайком прочитать лист отправителя', () => {
    expect(() => hit('зовёт_наивного')).toThrow(/отправителя не пришло/);
  });
});
