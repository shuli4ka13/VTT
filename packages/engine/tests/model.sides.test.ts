import { describe, it, expect } from 'vitest';
import { exchange } from './play.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

describe('имя листа — хозяин поля', () => {
  const ACTOR = { key: 'действующий', kind: 'sheet' };
  const TARGETS = { key: 'цели', kind: 'sheet', many: true };
  const EACH = { type: 'each', of: 'цели', as: 'цель' };
  const hurt = (who: string, amount: string) => ({ type: 'apply', target: { expr: `@${who}.хп` }, direction: 'subtract', value: { expr: amount } });

  const system = {
    id: 'стороны', name: 'стороны',
    tables: { лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'сила', label: 'Сила', kind: 'number' },
      { key: 'броня', label: 'Броня', kind: 'number', default: 10 },
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
    ] } , приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: {
      удар: {
        label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [EACH, hurt('цель', '@действующий.сила * 2 - @цель.броня')],
      },
      просто: {
        label: 'Просто', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [EACH, { type: 'emit', effect: 'урон', args: { раненый: { expr: '@цель' }, сколько: { expr: '@действующий.сила' } } }],
      },
      урон: {
        label: 'Урон', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
        steps: [hurt('раненый', '@сколько + @раненый.сила')],
      },
      читает_чужого: {
        label: 'Читает чужого', params: [{ key: 'раненый', kind: 'sheet' }, { key: 'кто', kind: 'sheet' }],
        steps: [hurt('раненый', '@кто.сила')],
      },
      зовёт: {
        label: 'Зовёт', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [EACH, { type: 'emit', effect: 'читает_чужого', args: { раненый: { expr: '@цель' }, кто: { expr: '@действующий' } } }],
      },
      наивный: {
        label: 'Наивный', activation: 'manual', params: [ACTOR, TARGETS],
        steps: [EACH, hurt('цель', '@сила')],
      },
    },
  } as unknown as System;
  const ids = ['удар', 'просто', 'зовёт', 'наивный'];
  const book = {
    records: ids.map(id => ({ id, table: 'приём', label: id, bindings: [{ label: id, effect: id, args: {} }] })),
  } as unknown as Compendium;
  const sheet = (id: string, сила: number, броня: number): Sheet =>
    ({ id, systemId: 'стороны', name: id, values: { сила, броня, хп: 20 }, has: ids.map(of => ({ of })), effects: [] } as unknown as Sheet);
  const hit = (action: string) => {
    const out = exchange({ system, compendium: book, die: () => 1, sheets: [sheet('бьёт', 7, 1), sheet('держит', 3, 5)], actionId: `${action}:0`, fromId: 'бьёт', toId: 'держит' });
    return out.sheets.find(x => x.id === 'держит')!.values.хп;
  };

  it('сила — у действующего, броня — у цели: 7·2 − 5 = 9', () => {
    expect(hit('удар')).toBe(20 - 9);
  });

  it('вызываемый эффект получает силу действующего входом, а силу раненого читает через его имя: 7 + 3', () => {
    expect(hit('просто')).toBe(20 - 10);
  });

  it('вызываемый эффект читает чужой лист, только если его передали входом: 7', () => {
    expect(hit('зовёт')).toBe(20 - 7);
  });

  it('голое имя поля в эффекте — отказ «чьё поле?»', () => {
    expect(() => hit('наивный')).toThrow(/чьё поле/);
  });
});
