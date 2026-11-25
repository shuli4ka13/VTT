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

  it('дельта с ушедшими листами убирает их и сбрасывает выбранный лист', () => {
    listenToRoom();
    const room = { id: 'к', title: 'Стол', members: [], system: { id: 'x', name: 'x', tables: {}, effects: {} }, compendium: { records: [] }, sheets: [{ id: 'а' }, { id: 'б' }], log: [] } as unknown as RoomState;
    deliver({ type: 'room:state', state: room });
    useRoom.getState().pickSheet('а');
    deliver({ type: 'room:delta', delta: { sheets: [], gone: ['а'], log: [] } });
    expect(useRoom.getState().room?.sheets.map(sheet => sheet.id)).toEqual(['б']);
    expect(useRoom.getState().mySheetId).toBeNull();
  });

  it('правила стола приходят сообщением и ложатся в комнату; чужой стол их не получает', () => {
    listenToRoom();
    const room = { id: 'к', title: 'Стол', members: [], system: { id: 'x', name: 'x', tables: {}, effects: {} }, compendium: { records: [] }, sheets: [], log: [] } as unknown as RoomState;
    deliver({ type: 'room:state', state: room });
    deliver({ type: 'room:rules', roomId: 'к', rules: { reactionRolls: true } });
    expect(useRoom.getState().room?.rules).toEqual({ reactionRolls: true });
    deliver({ type: 'room:rules', roomId: 'другой', rules: { reactionUseful: true } });
    expect(useRoom.getState().room?.rules).toEqual({ reactionRolls: true });
  });

  it('свой только что заведённый лист открывается и включает правку; чужой новый лист — нет', () => {
    listenToRoom();
    const room = { id: 'к', title: 'Стол', members: [], system: { id: 'x', name: 'x', tables: {}, effects: {} }, compendium: { records: [] }, sheets: [{ id: 'а', name: 'Арен' }], log: [] } as unknown as RoomState;
    deliver({ type: 'room:state', state: room });
    useRoom.getState().pickSheet('а');
    deliver({ type: 'room:delta', delta: { sheets: [{ id: 'ч', name: 'Чужой' }], log: [] } });
    expect(useRoom.getState().mySheetId).toBe('а');
    expect(useRoom.getState().filling).toBeNull();
    useRoom.getState().expectSheet('Торин', 'pc');
    deliver({ type: 'room:delta', delta: { sheets: [{ id: 'т', name: 'Торин', of: 'pc' }], log: [] } });
    expect(useRoom.getState().mySheetId).toBe('т');
    expect(useRoom.getState().filling).toBe('т');
    useRoom.getState().doneFilling();
    expect(useRoom.getState().filling).toBeNull();
  });
});
