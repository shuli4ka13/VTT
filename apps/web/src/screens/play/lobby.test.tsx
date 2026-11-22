// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';

const closed: string[] = [];

vi.mock('../../api/client.ts', () => ({
  onTokenChange: () => () => {},
  listWorlds: async () => [],
  listSystems: async () => [],
  listCompendiums: async () => [],
  publishWorld: async () => ({ id: 'м' }),
  createRoom: async () => ({}),
  listRooms: async () => [
    { id: 'мой', title: 'Мой стол', worldId: 'м', memberCount: 2, createdAt: '2026-11-01T10:05:00.000Z', gmName: 'Я', gm: true },
    { id: 'чужой', title: 'Чужой стол', worldId: 'м', memberCount: 1, createdAt: '2026-10-01T10:05:00.000Z', gmName: 'Он', gm: false },
  ],
  closeRoom: async (id: string) => { closed.push(id); return { ok: true }; },
  currentToken: () => 't',
}));

import { Lobby } from './lobby.tsx';

describe('лобби: убрать стол', () => {
  afterEach(cleanup);

  it('«Удалить» есть только у стола, где я ведущий, и зовёт сервер после подтверждения', async () => {
    render(<Lobby />);
    await screen.findByText('Мой стол');
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(closed).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'точно убрать' }));
    await waitFor(() => expect(closed).toEqual(['мой']));
  });
});

import { sortRooms, sortWorlds } from './lobby.tsx';

const world = (id: string, title: string, systemName: string, updatedAt: string) =>
  ({ id, title, systemName, compendiumCount: 0, authorName: 'Я', sheetCount: 0, updatedAt });
const room = (id: string, worldId: string, createdAt: string) =>
  ({ id, title: id, worldId, memberCount: 1, createdAt, gmName: 'Я', gm: false });

describe('лобби: одна вкладка и порядок', () => {
  afterEach(cleanup);

  it('сверху три кнопки, видна одна вкладка', async () => {
    render(<Lobby />);
    await screen.findByText('Мой стол');
    expect(screen.queryByText('Собранные миры')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Миры' }));
    expect(screen.getByText('Собранные миры')).toBeTruthy();
    expect(screen.queryByText('Мой стол')).toBeNull();
  });

  const worlds = [world('б', 'Бездна', 'Альфа', '2026-11-02'), world('а', 'Арка', 'Бета', '2026-11-01')];
  const rooms = [room('старый в Бездне', 'б', '2026-10-01'), room('новый в Арке', 'а', '2026-11-05'), room('новый в Бездне', 'б', '2026-11-03')];

  it('столы: по времени — новые сверху, по миру и по системе — группами, внутри новые сверху', () => {
    expect(sortRooms(rooms, worlds, 'time').map(r => r.id)).toEqual(['новый в Арке', 'новый в Бездне', 'старый в Бездне']);
    expect(sortRooms(rooms, worlds, 'world').map(r => r.id)).toEqual(['новый в Арке', 'новый в Бездне', 'старый в Бездне']);
    expect(sortRooms(rooms, worlds, 'system').map(r => r.id)).toEqual(['новый в Бездне', 'старый в Бездне', 'новый в Арке']);
  });

  it('миры: по времени — свежие сверху, по миру — по названию, по системе — по системе', () => {
    expect(sortWorlds(worlds, 'time').map(w => w.id)).toEqual(['б', 'а']);
    expect(sortWorlds(worlds, 'world').map(w => w.id)).toEqual(['а', 'б']);
    expect(sortWorlds(worlds, 'system').map(w => w.id)).toEqual(['б', 'а']);
  });
});
