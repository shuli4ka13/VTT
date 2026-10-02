import { describe, it, expect } from 'vitest';
import { authorize } from '../src/core/authorize.ts';
import type { Room } from '../src/core/authorize.ts';
import type { System, Sheet } from '../src/model/types.ts';

const sheet = (id: string): Sheet => ({ id, systemId: 'с', name: id, values: {}, has: [], effects: [] } as Sheet);

const room: Room = {
  system: { id: 'с', name: 'с', tables: {}, effects: {} } as unknown as System,
  sheets: [sheet('арвен'), sheet('мирра'), sheet('стол')],
  members: [
    { userId: 'ведущий', role: 'gm', sheetId: null },
    { userId: 'игрок-а', role: 'player', sheetId: 'арвен' },
    { userId: 'игрок-м', role: 'player', sheetId: 'мирра' },
    { userId: 'зритель', role: 'player', sheetId: null },
  ],
  clock: { round: 1, order: ['арвен', 'мирра'], active: 'арвен' },
};

const next = { kind: 'world' as const, op: { op: 'turn' as const, turn: 'next' as const } };

describe('права: следующий ход', () => {
  it('ведущий передаёт ход всегда', () => {
    expect(authorize(room, 'ведущий', next)).toBeNull();
  });

  it('хозяин листа, чей сейчас ход, заканчивает свой ход', () => {
    expect(authorize(room, 'игрок-а', next)).toBeNull();
  });

  it('чужой игрок и игрок без листа — нельзя', () => {
    expect(authorize(room, 'игрок-м', next)).toMatch(/ведущий или тот, чей сейчас ход/);
    expect(authorize(room, 'зритель', next)).toMatch(/ведущий или тот, чей сейчас ход/);
  });

  it('не участник — нельзя ничего', () => {
    expect(authorize(room, 'прохожий', next)).toBe('вы не в этой комнате');
  });
});

describe('права: стол и листы', () => {
  it('стол правит ведущий', () => {
    const set = { kind: 'world' as const, op: { op: 'kind' as const, sheetId: 'стол', of: null } };
    expect(authorize(room, 'ведущий', set)).toBeNull();
    expect(authorize(room, 'зритель', set)).toMatch(/стол правит ведущий/);
  });

  it('игрок с листом действует только своим', () => {
    const act = (fromId: string) => ({ kind: 'world' as const, op: { op: 'act' as const, intent: { actionId: 'x', fromId, toIds: [] } } });
    expect(authorize(room, 'игрок-а', act('арвен'))).toBeNull();
    expect(authorize(room, 'игрок-а', act('мирра'))).toMatch(/чужой лист/);
  });
});
