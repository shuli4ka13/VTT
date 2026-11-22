// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRoom, listenToRoom } from './room.ts';
import { useSession } from './session.ts';
import { tableSocket } from '../api/socket.ts';
import { setToken } from '../api/client.ts';
import type { RoomState, ServerMessage } from '@vtt/schema';

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: { event: string; data: Record<string, unknown> }[] = [];
  private handlers: Record<string, ((event: unknown) => void)[]> = {};
  constructor(readonly url: string) { FakeSocket.all.push(this); }
  addEventListener(type: string, handler: (event: unknown) => void) { (this.handlers[type] ??= []).push(handler); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; for (const h of this.handlers.open ?? []) h({}); }
  drop() { this.readyState = 3; for (const h of this.handlers.close ?? []) h({}); }
}

const deliver = (message: unknown) => {
  for (const listener of (tableSocket as unknown as { listeners: Set<(m: ServerMessage) => void> }).listeners) listener(message as ServerMessage);
};

const room = { id: 'к', title: 'Стол', members: [], system: { id: 'x', name: 'x', tables: {}, effects: {} }, compendium: { records: [] }, sheets: [], log: [] } as unknown as RoomState;

const login = (name: string) => vi.fn(async () => new Response(JSON.stringify({ userId: `u-${name}`, name, token: `т-${name}` }), { status: 200 }));

describe('стол и смена пользователя', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    listenToRoom();
    setToken(null);
  });
  afterEach(() => { vi.unstubAllGlobals(); setToken(null); tableSocket.close(); });

  async function joinAs(name: string) {
    vi.stubGlobal('fetch', login(name));
    await useSession.getState().enter(name);
    useRoom.getState().join('к');
    const socket = FakeSocket.all[FakeSocket.all.length - 1]!;
    socket.open();
    deliver({ type: 'room:state', state: room });
    useRoom.setState({ mySheetId: 'л', error: 'старая' });
    return socket;
  }

  it('смена имени закрывает сокет, сбрасывает стол и присоединяет заново с новым токеном', async () => {
    const old = await joinAs('А');
    expect(old.sent[0]).toMatchObject({ event: 'room:join', data: { roomId: 'к', token: 'т-А' } });
    expect(old.sent.filter(m => m.event === 'room:join')).toHaveLength(1);

    vi.stubGlobal('fetch', login('Б'));
    useSession.getState().leave();
    await useSession.getState().enter('Б');

    expect(old.readyState).toBe(3);
    const state = useRoom.getState();
    expect(state.room).toBeNull();
    expect(state.log).toEqual([]);
    expect(state.mySheetId).toBeNull();
    expect(state.error).toBeNull();
    expect(localStorage.getItem('vtt.room')).toBeNull();

    const sentBefore = old.sent.length;
    useRoom.getState().join('к');
    const fresh = FakeSocket.all[FakeSocket.all.length - 1]!;
    expect(fresh).not.toBe(old);
    fresh.open();
    tableSocket.claimSheet('к', 'л');
    expect(fresh.sent[0]).toMatchObject({ event: 'room:join', data: { roomId: 'к', token: 'т-Б' } });
    expect(fresh.sent.some(m => m.event === 'sheet:claim')).toBe(true);
    expect(old.sent.length).toBe(sentBefore);
  });

  it('после обрыва соединения сообщение стола уходит только после повторного присоединения с текущим токеном', async () => {
    const first = await joinAs('А');
    first.drop();
    first.readyState = 3;

    tableSocket.claimSheet('к', 'л');
    const second = FakeSocket.all[FakeSocket.all.length - 1]!;
    expect(second).not.toBe(first);
    expect(second.sent).toEqual([]);
    second.open();
    expect(second.sent.map(m => m.event)).toEqual(['room:join', 'sheet:claim']);
    expect(second.sent[0]!.data).toMatchObject({ roomId: 'к', token: 'т-А' });
  });
});
