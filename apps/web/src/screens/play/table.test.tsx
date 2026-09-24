// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useRoom } from '../../store/room.ts';
import { useSession } from '../../store/session.ts';
import { TableScreen, mayAnswer } from './table.tsx';
import type { RoomState } from '@vtt/schema';

const room = (clock: object | null): RoomState => ({
  id: 'к', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }],
  system: {
    id: 'x', name: 'x', fields: [], effects: {},
  },
  compendium: { records: [] },
  sheets: [
    { id: 'а', systemId: 'x', kind: 'pc', name: 'Арвен', values: {}, has: [], effects: [] },
    { id: 'б', systemId: 'x', kind: 'npc', name: 'Мирра', values: {}, has: [], effects: [] },
  ],
  ...(clock ? { clock } : {}),
} as unknown as RoomState);

describe('стол: журнал и бой', () => {
  beforeEach(() => {
    useRoom.setState(state => ({
      ...state,
      room: room({ round: 2, order: ['а', 'б'], active: 'а' }),
      log: [
        { id: '1', at: '2026-09-20T07:05:00.000Z', text: 'Арвен бьёт Мирру' },
        { id: '2', at: 'не время', text: 'без отметки' },
      ],
      error: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('журнал подписан временем, битая отметка не ломает строку', () => {
    renderOpen(<TableScreen />);
    const lines = [...document.querySelectorAll('.log-line')].map(node => node.textContent ?? '');
    expect(lines[0]).toMatch(/^\d{2}:\d{2}Арвен бьёт Мирру$/);
    expect(lines[1]).toBe('без отметки');
  });

  it('вне боя стол так и говорит', () => {
    useRoom.setState(state => ({ ...state, room: room(null) }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('Бой не идёт')).toBeTruthy();
  });
});

describe('выбор целей на столе', () => {
  beforeEach(() => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
  });
  afterEach(() => { cleanup(); });

  it('первый клик назначает действующего, следующие набирают цели и снимают их', () => {
    renderOpen(<TableScreen />);
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
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).toContain('token--to');

    fireEvent.click(screen.getByText('сбросить выбор'));
    expect(token('Арвен').className).not.toContain('token--from');
    expect(token('Мирра').className).not.toContain('token--to');
    expect(screen.getByText('Кто действует?')).toBeTruthy();
  });

  it('за другим столом выбор начинается заново', () => {
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;
    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));

    act(() => { useRoom.setState(state => ({ ...state, room: { ...room(null), id: 'другой' } })); });
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
    renderOpen(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
    expect(screen.getByText('отвечает владелец листа или ведущий')).toBeTruthy();
  });

  it('владельцу кнопки доступны', () => {
    useSession.setState({ userId: 'p1' });
    useRoom.setState(state => ({ ...state, room: asked(), log: [], error: null }));
    renderOpen(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
  });
});

describe('панель «Стол»', () => {
  const withDesk = (role: 'gm' | 'player'): RoomState => ({
    ...room(null),
    members: [{ userId: 'u', name: 'Я', role }],
    system: {
      id: 'x', name: 'x', effects: {},
      fields: [{ tag: 'страх', label: 'Страх', desk: true, value: { kind: 'stored', type: 'number', default: 0 } }],
    },
    sheets: [
      { id: 'а', systemId: 'x', kind: 'pc', name: 'Арвен', values: {}, has: [], effects: [] },
      { id: 'стол', systemId: 'x', kind: 'desk', name: 'Стол', values: { страх: 3 }, has: [], effects: [] },
    ],
  } as unknown as RoomState);

  beforeEach(() => { useSession.setState(state => ({ ...state, userId: 'u' })); });
  afterEach(() => { cleanup(); });

  it('ведущий правит значение стола, стола нет среди фишек', () => {
    useRoom.setState(state => ({ ...state, room: withDesk('gm'), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('общий для всех — правите вы')).toBeTruthy();
    expect(screen.getByDisplayValue('3')).toBeTruthy();
    expect([...document.querySelectorAll('.token__name')].map(n => n.textContent)).toEqual(['Арвен']);
  });

  it('игрок видит значение, но не правит', () => {
    useRoom.setState(state => ({ ...state, room: withDesk('player'), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('общий для всех — правит ведущий')).toBeTruthy();
    expect(screen.queryByDisplayValue('3')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
