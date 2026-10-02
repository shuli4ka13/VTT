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

describe('права: полная матрица', () => {
  const sys = {
    id: 'с', name: 'с', effects: {},
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
      казна: { shape: 'single', owner: 'group', columns: [{ key: 'золото', label: 'Золото', kind: 'number', default: 0 }] },
    },
  } as unknown as System;
  const grouped = (id: string, group?: string): Sheet => ({ ...sheet(id), ...(group ? { group } : {}) });
  const full: Room = {
    system: sys,
    sheets: [grouped('арвен', 'банда'), grouped('мирра', 'банда'), grouped('огр'), grouped('банда'), sheet('стол')],
    members: [
      { userId: 'ведущий', role: 'gm', sheetId: null },
      { userId: 'игрок-а', role: 'player', sheetId: 'арвен' },
      { userId: 'игрок-м', role: 'player', sheetId: 'мирра' },
      { userId: 'зритель', role: 'player', sheetId: null },
    ],
    clock: null,
  };
  const world = (op: object, hidden = false) => ({ kind: 'world' as const, op: op as never, hidden });
  const cases: [string, string, Parameters<typeof authorize>[2], boolean][] = [
    ['свой лист — правит', 'игрок-а', world({ op: 'belonging', sheetId: 'арвен', list: 'effects', id: 'x', on: true }), true],
    ['чужой закреплённый лист — нет', 'игрок-а', world({ op: 'belonging', sheetId: 'мирра', list: 'effects', id: 'x', on: true }), false],
    ['игрок без листа — свободный лист (НПС) правит', 'зритель', world({ op: 'kind', sheetId: 'огр', of: null }), true],
    ['игрок без листа — закреплённый за другим — нет', 'зритель', world({ op: 'kind', sheetId: 'арвен', of: null }), false],
    ['игрок без листа — лист группы — нет', 'зритель', world({ op: 'kind', sheetId: 'банда', of: null }), false],
    ['поле группы со своего листа — участник группы правит', 'игрок-а', world({ op: 'set', sheetId: 'арвен', tag: 'золото', value: 5 }), true],
    ['поле группы с чужого листа — нет', 'игрок-а', world({ op: 'set', sheetId: 'мирра', tag: 'золото', value: 5 }), false],
    ['поле группы — ведущий', 'ведущий', world({ op: 'set', sheetId: 'мирра', tag: 'золото', value: 5 }), true],
    ['своё поле на своём листе', 'игрок-м', world({ op: 'set', sheetId: 'мирра', tag: 'хп', value: 5 }), true],
    ['втайне — только ведущий', 'игрок-а', world({ op: 'roll', sheetId: 'арвен', tag: 'хп' }, true), false],
    ['втайне — ведущий', 'ведущий', world({ op: 'roll', sheetId: 'арвен', tag: 'хп' }, true), true],
    ['ответ — адресат', 'игрок-а', { kind: 'answer', sheetId: 'арвен' }, true],
    ['ответ — ведущий за игрока', 'ведущий', { kind: 'answer', sheetId: 'арвен' }, true],
    ['ответ — чужой игрок — нет', 'игрок-м', { kind: 'answer', sheetId: 'арвен' }, false],
    ['отмена — ведущий', 'ведущий', { kind: 'cancel' }, true],
    ['отмена — игрок — нет', 'игрок-а', { kind: 'cancel' }, false],
    ['закрепить свободный лист', 'зритель', { kind: 'claim', sheetId: 'огр' }, true],
    ['закрепить занятый лист — нет', 'зритель', { kind: 'claim', sheetId: 'арвен' }, false],
    ['закрепить стол — нет', 'зритель', { kind: 'claim', sheetId: 'стол' }, false],
    ['отпустить лист', 'игрок-а', { kind: 'claim', sheetId: null }, true],
    ['завести лист — любой участник', 'зритель', world({ op: 'sheet', name: 'Новый' }), true],
  ];
  for (const [title, user, want, allowed] of cases) {
    it(title, () => {
      const why = authorize(full, user, want);
      if (allowed) expect(why).toBeNull();
      else expect(why).toEqual(expect.any(String));
    });
  }
});
