// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useRoom } from '../../store/room.ts';
import { useSession } from '../../store/session.ts';
import { TableScreen, mayAnswer } from './table.tsx';
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

describe('выбор целей на столе', () => {
  beforeEach(() => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
  });
  afterEach(() => { cleanup(); });

  it('первый клик назначает действующего, следующие набирают цели и снимают их', () => {
    render(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

    fireEvent.click(token('Арвен'));
    expect(token('Арвен').className).toContain('token--from');
    expect(screen.getByText(/выберите цель/)).toBeTruthy();

    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).toContain('token--to');
    expect(screen.getByText('по Мирра')).toBeTruthy();

    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).not.toContain('token--to');

    fireEvent.click(token('Арвен'));
    expect(token('Арвен').className).not.toContain('token--from');
  });

  it('«сбросить выбор» снимает и действующего, и цели разом', () => {
    render(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).toContain('token--to');

    fireEvent.click(screen.getByText('сбросить выбор'));
    expect(token('Арвен').className).not.toContain('token--from');
    expect(token('Мирра').className).not.toContain('token--to');
    expect(screen.getByText('Кто действует?')).toBeTruthy();
  });
});

describe('вопрос стола: отвечает владелец листа или ведущий', () => {
  const asked = (): RoomState => ({
    ...room(null),
    members: [
      { userId: 'gm', name: 'Ведущий', role: 'gm', sheetId: null },
      { userId: 'p1', name: 'Первый', role: 'player', sheetId: 'а' },
      { userId: 'p2', name: 'Второй', role: 'player', sheetId: null },
    ],
    pending: { id: 'q', sheetId: 'а', stage: 'target', question: 'Арвен: ответить?', options: [{ id: 'shield', label: 'Щит' }], preview: [] },
  }) as unknown as RoomState;
  afterEach(() => { cleanup(); });

  it('право отвечать: ведущий — всегда, владелец — за свой лист, чужой — нет, свободный лист — любой без своего', () => {
    const state = asked();
    expect(mayAnswer(state, 'gm', 'а')).toBe(true);
    expect(mayAnswer(state, 'p1', 'а')).toBe(true);
    expect(mayAnswer(state, 'p2', 'а')).toBe(false);
    expect(mayAnswer(state, 'p2', 'б')).toBe(true);
    expect(mayAnswer(state, 'нет', 'а')).toBe(false);
  });

  it('чужому кнопки выключены и объяснено, кто отвечает', () => {
    useSession.setState({ userId: 'p2' });
    useRoom.setState(state => ({ ...state, room: asked(), log: [], error: null }));
    render(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
    expect(screen.getByText('отвечает владелец листа или ведущий')).toBeTruthy();
  });

  it('владельцу кнопки доступны', () => {
    useSession.setState({ userId: 'p1' });
    useRoom.setState(state => ({ ...state, room: asked(), log: [], error: null }));
    render(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
  });
});
