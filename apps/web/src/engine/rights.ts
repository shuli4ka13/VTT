import { authorize, shows, holderOf } from '@vtt/engine';
import type { Room, TurnOp, Viewer, Field } from '@vtt/engine';
import type { RoomState, System } from '@vtt/schema';

const roomOf = (room: RoomState): Room => ({
  system: room.system as System,
  sheets: room.sheets,
  members: room.members.map(m => ({ userId: m.userId, role: m.role === 'gm' ? 'gm' : 'player', sheetId: m.sheetId ?? null, ...(m.editsItems ? { editsItems: true } : {}) })),
  clock: room.clock ?? null,
});

export const mayTurn = (room: RoomState, userId: string, turn: TurnOp): boolean =>
  authorize(roomOf(room), userId, { kind: 'world', op: { op: 'turn', turn } }) === null;

export const mayAnswer = (room: RoomState, userId: string, sheetId: string): boolean =>
  authorize(roomOf(room), userId, { kind: 'answer', sheetId }) === null;

export const maySheet = (room: RoomState, userId: string, sheetId: string): boolean =>
  authorize(roomOf(room), userId, { kind: 'world', op: { op: 'kind', sheetId, of: null } }) === null;

export const mayField = (room: RoomState, userId: string, sheetId: string, tag: string): boolean =>
  authorize(roomOf(room), userId, { kind: 'world', op: { op: 'set', sheetId, tag, value: null } }) === null;

export const mayAllowItems = (room: RoomState, userId: string, whoId: string): boolean =>
  authorize(roomOf(room), userId, { kind: 'items', userId: whoId }) === null;

export const viewerOf = (room: RoomState, userId: string): Viewer => {
  const me = room.members.find(member => member.userId === userId);
  return { gm: me?.role === 'gm', sheetId: me?.sheetId ?? null };
};

export const seesField = (room: RoomState, userId: string, sheetId: string, field: Field): boolean => {
  const table = (room.system as System).tables?.[field.home];
  const holder = holderOf(table) === 'group' ? room.sheets.find(sheet => sheet.id === sheetId)?.group ?? sheetId : sheetId;
  return shows(room.sheets, viewerOf(room, userId), { id: holder }, field);
};

