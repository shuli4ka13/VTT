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

/** Последний стол помнится: обновил вкладку — вернулся туда же, а не в список. */
const LAST_ROOM = 'vtt.room';

export const useRoom = create<RoomStore>(set => ({
  room: null,
  log: [],
  error: null,
  mySheetId: null,

  join: roomId => {
    localStorage.setItem(LAST_ROOM, roomId);
    tableSocket.connect();
    tableSocket.join(roomId, currentToken() ?? '');
  },

  leave: () => {
    localStorage.removeItem(LAST_ROOM);
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
      useRoom.setState(current => {
        if (!current.room) return current;
        // Пришедшие листы ПОДМЕНЯЮТ одноимённые, а НОВЫЕ — добавляются:
        // «+ лист» приезжает той же дельтой, и терять его нельзя.
        const known = new Set(current.room.sheets.map(sheet => sheet.id));
        const sheets = current.room.sheets.map(sheet =>
          message.delta.sheets.find((next: Sheet) => next.id === sheet.id) ?? sheet);
        for (const fresh of message.delta.sheets) {
          if (!known.has(fresh.id)) sheets.push(fresh);
        }
        return {
          room: { ...current.room, sheets },
          log: [...current.log, ...message.delta.log],
        };
      });
    }

    if (message.type === 'room:members') {
      useRoom.setState(current => ({
        room: current.room && { ...current.room, members: message.members },
      }));
    }

    if (message.type === 'error') {
      // Не смогли вернуться в запомненный стол — забываем его, иначе
      // ошибка повторялась бы при каждом открытии страницы.
      if (!useRoom.getState().room) localStorage.removeItem(LAST_ROOM);
      useRoom.setState({ error: message.message });
    }
  });

  // Возврат за стол после перезагрузки. Без этого обновление вкладки
  // выбрасывало игрока в список комнат посреди боя.
  const last = localStorage.getItem(LAST_ROOM);
  if (last && currentToken()) useRoom.getState().join(last);
}
