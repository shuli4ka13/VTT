import { isDesk, DESK_ID } from '../engine/owners.ts';
import { holderOf } from './view.ts';
import { parseItemTag } from '../model/item-ref.ts';
import type { Op } from './perform.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet } from '../model/types.ts';

export interface Member {
  userId: string;
  role: 'gm' | 'player';
  sheetId: string | null;
  editsItems?: boolean;
}

export type Want =
  | { kind: 'world'; op: Op; hidden?: boolean }
  | { kind: 'answer'; sheetId: string }
  | { kind: 'cancel' }
  | { kind: 'claim'; sheetId: string | null }
  | { kind: 'place'; sheetId: string }
  | { kind: 'items'; userId: string }
  | { kind: 'close' };

export interface Room {
  system: System;
  sheets: readonly Sheet[];
  members: readonly Member[];
  clock?: Clock | null;
}

const isGroup = (sheet: Sheet, sheets: readonly Sheet[]): boolean => sheets.some(other => other.group === sheet.id);

export function maySheet(room: Room, me: Member, sheetId: string): string | null {
  if (me.role === 'gm') return null;
  const sheet = room.sheets.find(s => s.id === sheetId);
  if (sheetId === DESK_ID || (sheet && isDesk(sheet))) return 'стол правит ведущий';
  if (!sheet) return null;
  if (me.sheetId) return me.sheetId === sheetId ? null : 'это чужой лист — правит его владелец или ведущий';
  if (isGroup(sheet, room.sheets)) return 'лист группы правят её участники и ведущий';
  if (room.members.some(other => other.userId !== me.userId && other.sheetId === sheetId)) {
    return 'это чужой лист — правит его владелец или ведущий';
  }
  return null;
}

function mayField(room: Room, me: Member, sheetId: string, tag: string): string | null {
  const holder = holderOf(room.system, room.sheets, sheetId, tag);
  if (holder === sheetId) return maySheet(room, me, sheetId);
  if (me.role === 'gm') return null;
  const sheet = room.sheets.find(s => s.id === holder);
  if (sheet && isDesk(sheet)) return 'поле стола правит ведущий';
  const own = room.sheets.find(s => s.id === me.sheetId);
  if (sheet && own?.group === sheet.id && own.id === sheetId) return null;
  return 'поле группы правят её участники и ведущий';
}

function mayItem(room: Room, me: Member, sheetId: string): string | null {
  if (me.role === 'gm') return null;
  if (!me.editsItems) return 'значения вещей меняет ведущий — или тот, кому он разрешил';
  return maySheet(room, me, sheetId);
}

function subjectOf(op: Op): string | null {
  switch (op.op) {
    case 'act': return op.intent.fromId;
    case 'roll': case 'belonging': case 'kind': case 'group': return op.sheetId;
    default: return null;
  }
}

export function authorize(room: Room, userId: string, want: Want): string | null {
  const me = room.members.find(member => member.userId === userId);
  if (!me) return 'вы не в этой комнате';
  if (want.kind === 'close') return me.role === 'gm' ? null : 'убрать стол может только ведущий';
  if (want.kind === 'cancel') return me.role === 'gm' ? null : 'отменить действие может только ведущий';
  if (want.kind === 'answer') return maySheet(room, me, want.sheetId);
  if (want.kind === 'place') {
    const sheet = room.sheets.find(s => s.id === want.sheetId);
    if (!sheet) return `в комнате нет листа «${want.sheetId}»`;
    if (isDesk(sheet) || isGroup(sheet, room.sheets)) return 'стол и группа на поле не стоят';
    if (!room.system.grid) return 'в правилах нет сетки поля';
    if (me.role === 'gm' || me.sheetId === want.sheetId) return null;
    return me.sheetId ? 'это чужая фишка — двигает её владелец или ведущий' : 'сначала выберите своего персонажа — двигать можно только его';
  }
  if (want.kind === 'items') {
    if (me.role !== 'gm') return 'разрешает ведущий';
    const who = room.members.find(member => member.userId === want.userId);
    if (!who) return 'такого участника за столом нет';
    return who.role === 'gm' ? 'ведущему разрешать не нужно' : null;
  }
  if (want.kind === 'claim') {
    if (!want.sheetId) return null;
    const sheet = room.sheets.find(s => s.id === want.sheetId);
    if (!sheet) return `в комнате нет листа «${want.sheetId}»`;
    if (isDesk(sheet)) return 'стол общий — за ним не играют, его правит ведущий';
    if (room.members.some(other => other.userId !== userId && other.sheetId === want.sheetId)) return 'этим листом уже играет кто-то другой';
    return null;
  }
  if (want.hidden && me.role !== 'gm') return 'втайне бросает только ведущий';
  if (want.op.op === 'set') {
    return parseItemTag(want.op.tag) ? mayItem(room, me, want.op.sheetId) : mayField(room, me, want.op.sheetId, want.op.tag);
  }
  if (want.op.op === 'turn' && me.role !== 'gm') {
    if (want.op.turn !== 'next') return 'бой, отдых и сцену ведёт ведущий';
    return me.sheetId && room.clock?.active === me.sheetId ? null : 'следующий ход передаёт ведущий или тот, чей сейчас ход';
  }
  if (want.op.op === 'drop') {
    if (me.role === 'gm') return null;
    return me.sheetId === want.op.sheetId ? null : 'убрать лист может ведущий или тот, кто им играет';
  }
  const subject = subjectOf(want.op);
  return subject ? maySheet(room, me, subject) : null;
}
