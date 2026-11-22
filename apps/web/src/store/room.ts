import { create } from 'zustand';
import { tableSocket } from '../api/socket.ts';
import { currentToken, onTokenChange } from '../api/client.ts';
import type { RoomState, Sheet, LogEntry } from '@vtt/schema';

export interface RoomStore {
  room: RoomState | null;
  log: LogEntry[];
  error: string | null;

  mySheetId: string | null;

  secret: boolean;
  setSecret: (secret: boolean) => void;

  join: (roomId: string) => void;
  leave: () => void;
  pickSheet: (sheetId: string | null) => void;
  setError: (message: string | null) => void;
}

const LAST_ROOM = 'vtt.room';

export const useRoom = create<RoomStore>(set => ({
  room: null,
  log: [],
  error: null,
  mySheetId: null,
  secret: false,
  setSecret: secret => set({ secret }),

  join: roomId => {
    localStorage.setItem(LAST_ROOM, roomId);
    tableSocket.connect();
    tableSocket.join(roomId, currentToken() ?? '');
  },

  leave: () => {
    localStorage.removeItem(LAST_ROOM);
    tableSocket.close();
    set({ room: null, log: [], mySheetId: null, secret: false });
  },

  pickSheet: sheetId => set({ mySheetId: sheetId }),
  setError: message => set({ error: message }),
}));

onTokenChange(() => {
  tableSocket.close();
  localStorage.removeItem(LAST_ROOM);
  useRoom.setState({ room: null, log: [], mySheetId: null, secret: false, error: null });
});

export function mergeLog(known: LogEntry[], fresh: LogEntry[]): LogEntry[] {
  const at = new Map(known.map((entry, index) => [entry.id, index]));
  const next = [...known];
  for (const entry of fresh) {
    const index = at.get(entry.id);
    if (index === undefined) { at.set(entry.id, next.length); next.push(entry); }
    else next[index] = entry;
  }
  return next;
}

let listening = false;

export function listenToRoom(): void {
  if (listening) return;
  listening = true;

  tableSocket.on(message => {
    const state = useRoom.getState();

    if (message.type === 'room:state') {
      useRoom.setState({
        room: message.state,
        log: message.state.log,
        error: null,

        mySheetId: state.mySheetId ?? (message.state.sheets.length === 1
          ? message.state.sheets[0]!.id : null),
      });
    }

    if (message.type === 'room:delta') {
      useRoom.setState(current => {
        if (!current.room) return current;

        const known = new Set(current.room.sheets.map(sheet => sheet.id));
        const gone = new Set(message.delta.gone ?? []);
        const sheets = current.room.sheets
          .filter(sheet => !gone.has(sheet.id))
          .map(sheet => message.delta.sheets.find((next: Sheet) => next.id === sheet.id) ?? sheet);
        for (const fresh of message.delta.sheets) {
          if (!known.has(fresh.id)) sheets.push(fresh);
        }
        return {
          mySheetId: current.mySheetId && gone.has(current.mySheetId) ? null : current.mySheetId,
          room: {
            ...current.room, sheets,
            ...(message.delta.clock ? { clock: message.delta.clock } : {}),
            ...(message.delta.pending !== undefined ? { pending: message.delta.pending } : {}),
          },
          log: mergeLog(current.log, message.delta.log),
        };
      });
    }

    if (message.type === 'room:members') {
      useRoom.setState(current => ({
        room: current.room && { ...current.room, members: message.members },
      }));
    }

    if (message.type === 'room:places') {
      useRoom.setState(current => ({
        room: current.room && current.room.id === message.roomId ? { ...current.room, places: message.places } : current.room,
      }));
    }

    if (message.type === 'room:closed' && state.room?.id === message.roomId) {
      state.leave();
      useRoom.setState({ error: 'Ведущий убрал этот стол' });
    }

    if (message.type === 'error') {

      if (!useRoom.getState().room) localStorage.removeItem(LAST_ROOM);
      useRoom.setState({ error: message.message });
    }
  });

  const last = localStorage.getItem(LAST_ROOM);
  if (last && currentToken()) useRoom.getState().join(last);
}
