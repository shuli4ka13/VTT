// Состояние комнаты — общее для обоих экранов партии.
//
// Лист персонажа и стол смотрят в ОДНО место: это тот мир, в который играют,
// и он приходит с сервера. Иначе получилось бы, что персонаж живёт в одном
// мире, а стол в другом, — ровно та путаница, из-за которой приложения
// и разведены.
//
// Наполняет его сокет: полный срез при входе, дальше только дельты.

import { create } from 'zustand';
import { tableSocket } from '../api/socket.ts';
import { currentToken } from '../api/client.ts';
import type { RoomState, Sheet } from '@vtt/schema';

export interface RoomStore {
  room: RoomState | null;
  log: { id: string; at: string; text: string }[];
  error: string | null;
  /** Чьим листом играет этот человек. Выбирается один раз и живёт в интерфейсе. */
  mySheetId: string | null;

  join: (roomId: string) => void;
  leave: () => void;
  pickSheet: (sheetId: string | null) => void;
  setError: (message: string | null) => void;
}

export const useRoom = create<RoomStore>((set, get) => ({
  room: null,
  log: [],
  error: null,
  mySheetId: null,

  join: roomId => {
    tableSocket.connect();
    tableSocket.join(roomId, currentToken() ?? '');
  },

  leave: () => {
    tableSocket.close();
    set({ room: null, log: [], mySheetId: null });
  },

  pickSheet: sheetId => set({ mySheetId: sheetId }),
  setError: message => set({ error: message }),
}));

/**
 * Подписка на канал. Заводится ОДИН раз на приложение, а не в каждом экране:
 * иначе два экрана обрабатывали бы одну дельту дважды.
 */
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
        // Свой лист выбирается сам, если он один: спрашивать не о чем.
        mySheetId: state.mySheetId ?? (message.state.sheets.length === 1
          ? message.state.sheets[0]!.id : null),
      });
    }

    if (message.type === 'room:delta') {
      useRoom.setState(current => ({
        room: current.room && {
          ...current.room,
          // Подменяются ТОЛЬКО пришедшие листы: дельта на то и дельта.
          sheets: current.room.sheets.map(sheet =>
            message.delta.sheets.find((next: Sheet) => next.id === sheet.id) ?? sheet),
        },
        log: [...current.log, ...message.delta.log],
      }));
    }

    if (message.type === 'room:members') {
      useRoom.setState(current => ({
        room: current.room && { ...current.room, members: message.members },
      }));
    }

    if (message.type === 'error') useRoom.setState({ error: message.message });
  });
}
