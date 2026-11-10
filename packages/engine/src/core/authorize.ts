import { isDesk } from '../engine/owners.ts';
import { holderOf } from './view.ts';
import type { Op } from './perform.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet } from '../model/types.ts';

export interface Member {
  userId: string;
  role: 'gm' | 'player';
  sheetId: string | null;
}

export type Want =
  | { kind: 'world'; op: Op; hidden?: boolean }
  | { kind: 'answer'; sheetId: string }
  | { kind: 'cancel' }
  | { kind: 'claim'; sheetId: string | null }
  | { kind: 'place'; sheetId: string };

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
  if (!sheet) return null;
  if (isDesk(sheet)) return 'стол правит ведущий';
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
  if (want.kind === 'cancel') return me.role === 'gm' ? null : 'отменить действие может только ведущий';
  if (want.kind === 'answer') return maySheet(room, me, want.sheetId);
  if (want.kind === 'place') {
    const sheet = room.sheets.find(s => s.id === want.sheetId);
    if (!sheet) return `в комнате нет листа «${want.sheetId}»`;
    if (isDesk(sheet) || isGroup(sheet, room.sheets)) return 'стол и группа на поле не стоят';
    if (!room.system.grid) return 'в правилах нет сетки поля';
    return maySheet(room, me, want.sheetId);
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
  if (want.op.op === 'set') return mayField(room, me, want.op.sheetId, want.op.tag);
  if (want.op.op === 'turn' && me.role !== 'gm') {
    if (want.op.turn !== 'next') return 'бой, отдых и сцену ведёт ведущий';
    return me.sheetId && room.clock?.active === me.sheetId ? null : 'следующий ход передаёт ведущий или тот, чей сейчас ход';
  }
  const subject = subjectOf(want.op);
  return subject ? maySheet(room, me, subject) : null;
}
