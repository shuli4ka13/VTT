import { describe, it, expect } from 'vitest';
import { mayAnswer, maySheet, mayField, mayPassTurn } from './rights.ts';
import type { RoomState } from '@vtt/schema';

const sheet = (id: string, group?: string) => ({ id, systemId: 'с', name: id, values: {}, has: [], effects: [], ...(group ? { group } : {}) });

const room = {
  id: 'к', title: 'Стол',
  system: {
    id: 'с', name: 'с', effects: {},
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
      казна: { shape: 'single', owner: 'group', columns: [{ key: 'золото', label: 'Золото', kind: 'number', default: 0 }] },
    },
  },
  compendium: { records: [] },
  sheets: [sheet('арвен', 'банда'), sheet('мирра'), sheet('банда'), sheet('стол')],
  members: [
    { userId: 'ведущий', name: 'В', role: 'gm', sheetId: null },
    { userId: 'игрок-а', name: 'А', role: 'player', sheetId: 'арвен' },
    { userId: 'игрок-м', name: 'М', role: 'player', sheetId: 'мирра' },
  ],
  log: [],
  clock: { round: 1, order: ['арвен', 'мирра'], active: 'арвен' },
} as unknown as RoomState;

describe('права в вебе — та же функция, что на сервере', () => {
  it('«Следующий ход» — ведущему и тому, чей ход', () => {
    expect(mayPassTurn(room, 'ведущий')).toBe(true);
    expect(mayPassTurn(room, 'игрок-а')).toBe(true);
    expect(mayPassTurn(room, 'игрок-м')).toBe(false);
  });

  it('стол правит только ведущий', () => {
    expect(maySheet(room, 'ведущий', 'стол')).toBe(true);
    expect(maySheet(room, 'игрок-а', 'стол')).toBe(false);
  });

  it('поле группы — участник группы со своего листа, но не чужой игрок', () => {
    expect(mayField(room, 'игрок-а', 'арвен', 'золото')).toBe(true);
    expect(mayField(room, 'игрок-м', 'арвен', 'золото')).toBe(false);
  });

  it('ответ — адресат или ведущий', () => {
    expect(mayAnswer(room, 'игрок-а', 'арвен')).toBe(true);
    expect(mayAnswer(room, 'ведущий', 'арвен')).toBe(true);
    expect(mayAnswer(room, 'игрок-м', 'арвен')).toBe(false);
  });
});
