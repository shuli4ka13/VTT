import { api } from '@vtt/schema';
import type { ServerMessage, ActIntent, TurnIntent, AnswerIntent, CancelIntent, StoredValue } from '@vtt/schema';

type Listener = (message: ServerMessage) => void;

export class TableSocket {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private queue: string[] = [];

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      for (const message of this.queue) socket.send(message);
      this.queue = [];
    });

    socket.addEventListener('message', event => {
      let payload: unknown;
      try { payload = JSON.parse(String(event.data)); } catch { return; }

      const inner = (payload as { data?: unknown })?.data ?? payload;
      const parsed = api.serverMessage.safeParse(inner);
      if (!parsed.success) return;

      for (const listener of this.listeners) listener(parsed.data);
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  join(roomId: string, token: string): void {
    this.send('room:join', { roomId, token });
  }

  act(intent: ActIntent): void {
    this.send('room:act', { intent });
  }

  turn(intent: TurnIntent): void {
    this.send('room:turn', { intent });
  }

  answer(intent: AnswerIntent): void {
    this.send('room:answer', { intent });
  }

  cancel(intent: CancelIntent): void {
    this.send('room:cancel', { intent });
  }

  setValue(roomId: string, sheetId: string, tag: string, value: StoredValue): void {
    this.send('sheet:set', { roomId, sheetId, tag, value });
  }

  claimSheet(roomId: string, sheetId: string | null): void {
    this.send('sheet:claim', { roomId, sheetId });
  }

  rollField(roomId: string, sheetId: string, tag: string, hidden = false, claims: string[] = []): void {
    this.send('sheet:roll', { roomId, sheetId, tag, ...(hidden ? { hidden } : {}), ...(claims.length ? { claims } : {}) });
  }

  createSheet(roomId: string, name: string, of?: string): void {
    this.send('sheet:create', { roomId, name, ...(of ? { of } : {}) });
  }

  setSheetKind(roomId: string, sheetId: string, of: string | null): void {
    this.send('sheet:of', { roomId, sheetId, of });
  }

  setSheetGroup(roomId: string, sheetId: string, group: string | null): void {
    this.send('sheet:group', { roomId, sheetId, group });
  }

  setBelonging(
    roomId: string, sheetId: string,
    list: 'has' | 'effects', id: string, on: boolean, off?: boolean,
    item: { inst?: string; add?: boolean; in?: string | null } = {},
  ): void {
    this.send('sheet:belong', {
      roomId, sheetId, list, id, on, ...(off ? { off } : {}),
      ...(item.inst ? { inst: item.inst } : {}), ...(item.add ? { add: true } : {}), ...(item.in !== undefined ? { in: item.in } : {}),
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private send(event: string, data: object): void {
    const message = JSON.stringify({ event, data });

    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    else { this.queue.push(message); this.connect(); }
  }
}

export const tableSocket = new TableSocket();
