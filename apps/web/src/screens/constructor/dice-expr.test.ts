import { describe, it, expect } from 'vitest';
import { parseDiceExpr, formatDiceExpr, diceCount } from './dice-expr.ts';
import type { System } from '@vtt/schema';

// Проверка ровно на вопрос Влада: собираются ли кости четырёх непохожих
// систем ОДНОЙ строкой, без отдельных контролов под каждый случай.

const system = {
  fields: [
    { tag: 'пул', label: 'Пул костей', value: { kind: 'stored', type: 'number', default: 6 } },
  ],
  effects: {},
} as unknown as System;

const round = (text: string) => formatDiceExpr(parseDiceExpr(text, system).dice);

describe('состав кости одной строкой', () => {
  it('D&D: одна к20', () => {
    expect(parseDiceExpr('1d20', system).dice).toEqual([{ count: 1, sides: 20 }]);
  });

  it('Cyberpunk: одна к10 — счёт можно и не писать', () => {
    expect(parseDiceExpr('d10', system).dice).toEqual([{ count: 1, sides: 10 }]);
  });

  it('Shadowrun: пул костей из поля листа', () => {
    expect(parseDiceExpr('#пул d6', system).dice)
      .toEqual([{ count: { tag: 'пул' }, sides: 6 }]);
  });

  it('Daggerheart: две к12 с именами частей', () => {
    expect(parseDiceExpr('1d12 Надежда + 1d12 Страх', system).dice).toEqual([
      { count: 1, sides: 12, name: 'надежда', label: 'Надежда' },
      { count: 1, sides: 12, name: 'страх', label: 'Страх' },
    ]);
  });

  it('кириллическая «к» работает наравне с латинской', () => {
    expect(parseDiceExpr('2к6', system).dice).toEqual([{ count: 2, sides: 6 }]);
  });

  it('строка переживает круг: разобрали — собрали обратно', () => {
    expect(round('1d20')).toBe('1d20');
    expect(round('#пул d6')).toBe('#пул d6');
    expect(round('1d12 Надежда + 1d12 Страх')).toBe('1d12 Надежда + 1d12 Страх');
  });
});

describe('ошибки называют причину, а не «неверный ввод»', () => {
  it('поля для пула в системе нет', () => {
    expect(parseDiceExpr('#нетполя d6', system).error).toMatch(/нет/);
  });

  it('мусор вместо записи', () => {
    expect(parseDiceExpr('котик', system).error).toMatch(/не разобрать/);
  });

  it('имена либо у всех частей, либо ни у одной', () => {
    expect(parseDiceExpr('1d12 Надежда + 1d12', system).error).toMatch(/имена/);
  });

  it('кость об одной грани не бывает', () => {
    expect(parseDiceExpr('1d1', system).error).toMatch(/граней/);
  });
});

describe('сколько костей в составе', () => {
  it('литеральный состав считается', () => {
    expect(diceCount([{ count: 2, sides: 6 }, { count: 1, sides: 6 }])).toBe(3);
  });

  it('пул из листа заранее неизвестен — и это отдельный ответ', () => {
    expect(diceCount([{ count: { tag: 'пул' }, sides: 6 } as never])).toBe(null);
  });
});
