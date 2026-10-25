// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useRoom, listenToRoom } from './room.ts';
import { tableSocket } from '../api/socket.ts';
import type { RoomState, ServerMessage } from '@vtt/schema';

const deliver = (message: unknown) => {
  for (const listener of (tableSocket as unknown as { listeners: Set<(m: ServerMessage) => void> }).listeners) listener(message as ServerMessage);
};

describe('стор комнаты: слияние дельт', () => {
  it('переносит строки журнала и итоги инициативы; повтор записи заменяет её, а не дублирует', () => {
    listenToRoom();
    const room = { id: 'к', title: 'Стол', members: [], system: { id: 'x', name: 'x', tables: {}, effects: {} }, compendium: { records: [] }, sheets: [], log: [] } as unknown as RoomState;
    deliver({ type: 'room:state', state: room });
    deliver({ type: 'room:delta', delta: {
      sheets: [], pending: null,
      clock: { round: 1, order: ['а', 'б'], active: 'а', scores: { а: 14, б: 9 } },
      log: [{ id: '1', at: 'x', text: 'Арен применяет «Удар» · Бросок: [5]', lines: ['Арен применяет «Удар»', 'Бросок: [5]'] }],
    } });
    deliver({ type: 'room:delta', delta: { sheets: [], log: [{ id: '1', at: 'x', text: 'Арен применяет «Удар»' }] } });
    const state = useRoom.getState();
    expect(state.room?.clock?.scores).toEqual({ а: 14, б: 9 });
    expect(state.log).toHaveLength(1);
    expect(state.log[0]!.text).toBe('Арен применяет «Удар»');

    deliver({ type: 'room:delta', delta: { sheets: [], log: [{ id: '2', at: 'x', text: 'т', lines: ['ш', 'п'] }] } });
    expect(useRoom.getState().log.map(entry => entry.lines ?? null)).toEqual([null, ['ш', 'п']]);
  });
});
