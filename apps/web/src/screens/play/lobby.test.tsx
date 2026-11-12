// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';

const closed: string[] = [];

vi.mock('../../api/client.ts', () => ({
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
