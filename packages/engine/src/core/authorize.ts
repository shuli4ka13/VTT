import { isDesk, DESK_ID } from '../engine/owners.ts';
import { holderOf } from './view.ts';
import { parseItemTag } from '../model/item-ref.ts';
import { fieldOf } from '../model/sheet-columns.ts';
import { knows, shows } from '../model/roles.ts';
import type { Op } from './perform.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet } from '../model/types.ts';
import { tr } from '../words/tongue.ts';

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
  if (sheetId === DESK_ID || (sheet && isDesk(sheet))) return tr`стол правит ведущий`;
  if (!sheet) return null;
  if (me.sheetId) return me.sheetId === sheetId ? null : tr`это чужой лист — правит его владелец или ведущий`;
  if (isGroup(sheet, room.sheets)) return tr`лист группы правят её участники и ведущий`;
  if (room.members.some(other => other.userId !== me.userId && other.sheetId === sheetId)) {
    return tr`это чужой лист — правит его владелец или ведущий`;
  }
  return null;
}

function mayHolder(room: Room, me: Member, sheetId: string, holder: string): string | null {
  if (holder === sheetId) return maySheet(room, me, sheetId);
  if (me.role === 'gm') return null;
  const sheet = room.sheets.find(s => s.id === holder);
  if (sheet && isDesk(sheet)) return tr`поле стола правит ведущий`;
  const own = room.sheets.find(s => s.id === me.sheetId);
  if (sheet && own?.group === sheet.id && own.id === sheetId) return null;
  return tr`поле группы правят её участники и ведущий`;
}

export const fieldByRules = (): string => tr`это поле ставят правила — руками его не правят`;
export const fieldByGm = (): string => tr`это поле правит ведущий`;
export const fieldUnseen = (): string => tr`этого поля вы не видите`;
export const groupByGm = (): string => tr`в группу лист ставит ведущий`;

function mayField(room: Room, me: Member, sheetId: string, tag: string): string | null {
  const holder = holderOf(room.system, room.sheets, sheetId, tag);
  const why = mayHolder(room, me, sheetId, holder);
  const field = fieldOf(room.system, tag);
  if (why || !field) return why;
  if (field.sees === 'none' || field.edits === 'none') return fieldByRules();
  if (me.role === 'gm') return null;
  if (!knows(room.sheets, { gm: false, sheetId: me.sheetId }, { id: holder }, field)) return fieldUnseen();
  return field.edits === 'gm' ? fieldByGm() : null;
}

function mayItem(room: Room, me: Member, sheetId: string): string | null {
  if (me.role === 'gm') return null;
  if (!me.editsItems) return tr`значения вещей меняет ведущий — или тот, кому он разрешил`;
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
  if (!me) return tr`вы не в этой комнате`;
  if (want.kind === 'close') return me.role === 'gm' ? null : tr`убрать стол может только ведущий`;
  if (want.kind === 'cancel') return me.role === 'gm' ? null : tr`отменить действие может только ведущий`;
  if (want.kind === 'answer') return maySheet(room, me, want.sheetId);
  if (want.kind === 'place') {
    const sheet = room.sheets.find(s => s.id === want.sheetId);
    if (!sheet) return tr`в комнате нет листа «${want.sheetId}»`;
    if (isDesk(sheet) || isGroup(sheet, room.sheets)) return tr`стол и группа на поле не стоят`;
    if (!room.system.grid) return tr`в правилах нет сетки поля`;
    if (me.role === 'gm' || me.sheetId === want.sheetId) return null;
    return me.sheetId ? tr`это чужая фишка — двигает её владелец или ведущий` : tr`сначала выберите своего персонажа — двигать можно только его`;
  }
  if (want.kind === 'items') {
    if (me.role !== 'gm') return tr`разрешает ведущий`;
    const who = room.members.find(member => member.userId === want.userId);
    if (!who) return tr`такого участника за столом нет`;
    return who.role === 'gm' ? tr`ведущему разрешать не нужно` : null;
  }
  if (want.kind === 'claim') {
    if (!want.sheetId) return null;
    const sheet = room.sheets.find(s => s.id === want.sheetId);
    if (!sheet) return tr`в комнате нет листа «${want.sheetId}»`;
    if (isDesk(sheet)) return tr`стол общий — за ним не играют, его правит ведущий`;
    if (room.members.some(other => other.userId !== userId && other.sheetId === want.sheetId)) return tr`этим листом уже играет кто-то другой`;
    return null;
  }
  if (want.hidden && me.role !== 'gm') return tr`втайне бросает только ведущий`;
  if (want.op.op === 'set' || want.op.op === 'shift') {
    return parseItemTag(want.op.tag) ? mayItem(room, me, want.op.sheetId) : mayField(room, me, want.op.sheetId, want.op.tag);
  }
  if (want.op.op === 'roll' && me.role !== 'gm') {
    const { sheetId, tag, second } = want.op;
    const why = maySheet(room, me, sheetId);
    if (why) return why;
    const unseen = [tag, ...(second ? [second] : [])].some(name => {
      const field = fieldOf(room.system, name);
      return field && !shows(room.sheets, { gm: false, sheetId: me.sheetId }, { id: holderOf(room.system, room.sheets, sheetId, name) }, field);
    });
    return unseen ? fieldUnseen() : null;
  }
  if (want.op.op === 'group' && want.op.group !== null && me.role !== 'gm') return groupByGm();
  if (want.op.op === 'turn' && me.role !== 'gm') {
    if (want.op.turn !== 'next') return tr`бой, отдых и сцену ведёт ведущий`;
    return me.sheetId && room.clock?.active === me.sheetId ? null : tr`следующий ход передаёт ведущий или тот, чей сейчас ход`;
  }
  if (want.op.op === 'drop') {
    if (me.role === 'gm') return null;
    return me.sheetId === want.op.sheetId ? null : tr`убрать лист может ведущий или тот, кто им играет`;
  }
  const subject = subjectOf(want.op);
  return subject ? maySheet(room, me, subject) : null;
}
