// Канал стола. Одно соединение на приложение; экраны подписываются на срез
// и дельты, а не держат сокет каждый у себя.
//
// Здесь же — правило, ради которого канал вообще двусторонний: полный срез
// приходит ОДИН раз, при входе; дальше только дельты. Иначе чужая печать
// в чате гоняла бы по сети систему с компендиумом и дёргала бы карту.

import { api } from '@vtt/schema';
import type { ServerMessage, ActIntent, StoredValue } from '@vtt/schema';

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

      // Сервер оборачивает сообщение в { event, data } — распаковываем,
      // но разбираем схемой САМО сообщение: обёртка не контракт.
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

  setValue(roomId: string, sheetId: string, tag: string, value: StoredValue): void {
    this.send('sheet:set', { roomId, sheetId, tag, value });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private send(event: string, data: object): void {
    const message = JSON.stringify({ event, data });
    // Сообщение, отправленное до открытия сокета, теряется молча — и это
    // самый неприятный род ошибки: всё «работает», но ничего не происходит.
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    else { this.queue.push(message); this.connect(); }
  }
}

export const tableSocket = new TableSocket();
