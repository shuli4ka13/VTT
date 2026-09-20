// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useRoom } from '../../store/room.ts';
import { TableScreen } from './table.tsx';
import type { RoomState } from '@vtt/schema';

const room = (clock: object | null): RoomState => ({
  id: 'к', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }],
  system: {
    id: 'x', name: 'x', fields: [], effects: {},
    action_types: { действие: { label: 'Действие', perTurn: 1 }, реакция: { label: 'Реакция' } },
  },
  compendium: { items: [], actions: [] },
  sheets: [
    { id: 'а', systemId: 'x', kind: 'pc', name: 'Арвен', values: {}, equipped: [], effects: [], actions: [] },
    { id: 'б', systemId: 'x', kind: 'npc', name: 'Мирра', values: {}, equipped: [], effects: [], actions: [] },
  ],
  ...(clock ? { clock } : {}),
} as unknown as RoomState);

describe('стол: бюджет хода и журнал', () => {
  beforeEach(() => {
    useRoom.setState(state => ({
      ...state,
      room: room({ round: 2, order: ['а', 'б'], active: 'а', spent: { а: { действие: 1, реакция: 2 } } }),
      log: [
        { id: '1', at: '2026-09-20T07:05:00.000Z', text: 'Арвен бьёт Мирру' },
        { id: '2', at: 'не время', text: 'без отметки' },
      ],
      error: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('показывает, сколько действий осталось, и считает потраченные без счёта', () => {
    render(<TableScreen />);
    expect(screen.getByText('Бюджет хода')).toBeTruthy();
    expect(screen.getByText(/Действие: 0 из 1/)).toBeTruthy();
    expect(screen.getByText(/Реакция: потрачено 2/)).toBeTruthy();
  });

  it('журнал подписан временем, битая отметка не ломает строку', () => {
    render(<TableScreen />);
    const lines = [...document.querySelectorAll('.log-line')].map(node => node.textContent ?? '');
    expect(lines[0]).toMatch(/^\d{2}:\d{2}Арвен бьёт Мирру$/);
    expect(lines[1]).toBe('без отметки');
  });

  it('вне боя бюджет не показывается', () => {
    useRoom.setState(state => ({ ...state, room: room(null) }));
    render(<TableScreen />);
    expect(screen.queryByText('Бюджет хода')).toBeNull();
    expect(screen.getByText('Бой не идёт')).toBeTruthy();
  });
});
