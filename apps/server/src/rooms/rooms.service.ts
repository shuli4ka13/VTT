import { seenBy } from './visibility.ts';
import type { Sight } from './visibility.ts';
import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { eq, asc, desc } from 'drizzle-orm';
import { DB, RAW, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import type { DatabaseSync } from 'node:sqlite';
import { rooms, roomSheets, roomJournal, members, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { RoomStore, openTable } from './store.ts';
import type {
  RoomState, RoomSummary, RoomDelta, JournalEntry, ActIntent, TurnIntent, AnswerIntent, CancelIntent, ClockState, PendingState,
  Sheet, System, Compendium, StoredValue, LogEntry, Place, Places,
} from '@vtt/schema';
import { flattenSystem, perform, authorize, emptyJournal, deskOf, hasDesk, blankDesk, DESK_ID, idleClock, EngineError, askOneWords, askDeskTitle, knows, findField, NO_SHEET, mainLang, inSystemTongue, inTongue } from '@vtt/engine';
import type { Op, Performed, Want, Journal, Question } from '@vtt/engine';
import { say, sayIn, langNow } from '../common/words.ts';

export type Role = 'gm' | 'player';

interface PendingRecord {
  id?: string;
  roomId: string;
  op: Op;
  userId: string;
  hidden: boolean;
  clock: ClockState;
  snapshot: Sheet[];
  journal: Journal;
  question: Question;
  logged: number;
}

type Started = Omit<PendingRecord, 'id' | 'question'>;

type RoomRow = { id: string; system: string; compendium: string };

const targetsOf = (intent: ActIntent): string[] => [...new Set(intent.toIds)];

@Injectable()
export class RoomsService {
  private readonly store: RoomStore;
  private readonly listeners = new Set<(delta: RoomDelta) => void>();
  private readonly closers = new Set<(roomId: string) => void>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RAW) raw: DatabaseSync,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
    @Inject(DIE) private readonly die: (sides: number) => number,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
  ) {
    this.store = new RoomStore(raw);
  }

  onDelta(listener: (delta: RoomDelta) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: (roomId: string) => void): () => void {
    this.closers.add(listener);
    return () => this.closers.delete(listener);
  }

  close(userId: string, roomId: string): Promise<void> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      this.allow(room, userId, { kind: 'close' });
      this.store.close(roomId);
      this.worlds.delete(roomId);
      for (const listener of this.closers) listener(roomId);
    });
  }

  private readonly worlds = new Map<string, { system: string; compendium: string; world: { system: System; compendium: Compendium } }>();

  private worldOf(room: RoomRow): { system: System; compendium: Compendium } {
    const known = this.worlds.get(room.id);
    if (known && known.system === room.system && known.compendium === room.compendium) return known.world;
    const world = { system: flattenSystem(JSON.parse(room.system) as System), compendium: JSON.parse(room.compendium) as Compendium };
    this.worlds.set(room.id, { system: room.system, compendium: room.compendium, world });
    return world;
  }

  sights(roomId: string): (userId: string) => Sight {
    const { system } = this.worldOf(this.requireRoom(roomId));
    const members = this.store.members(roomId);
    const sheets = this.store.sheets(roomId);
    return userId => {
      const me = members.find(member => member.userId === userId);
      return { gm: me?.role === 'gm', sheetId: me?.sheetId ?? null, system, sheets };
    };
  }

  sight(roomId: string, userId: string): Sight {
    return this.sights(roomId)(userId);
  }

  async create(userId: string, worldId: string, title: string): Promise<RoomSummary> {
    const world = await this.worldsService.get(worldId);
    const id = this.newId();
    const createdAt = this.now();
    await this.db.insert(rooms).values({
      id, title, worldId, system: JSON.stringify(world.system), compendium: JSON.stringify(world.compendium), createdAt,
    });
    const withDesk = hasDesk(world.system) && !deskOf(world.sheets)
      ? [...world.sheets, blankDesk(flattenSystem(world.system))]
      : world.sheets;
    for (const sheet of withDesk) await this.db.insert(roomSheets).values({ roomId: id, sheetId: sheet.id, data: JSON.stringify(sheet) });
    await this.db.insert(members).values({ roomId: id, userId, role: 'gm', sheetId: null });
    const [me] = await this.db.select().from(users).where(eq(users.id, userId));
    return { id, title, worldId, memberCount: 1, createdAt, gmName: me?.name ?? say`неизвестен`, gm: true };
  }

  join(userId: string, roomId: string): Promise<void> {
    return this.inTurn(roomId, async () => {
      this.requireRoom(roomId);
      if (this.store.members(roomId).some(member => member.userId === userId)) return;
      await this.db.insert(members).values({ roomId, userId, role: 'player', sheetId: null });
    });
  }

  async state(roomId: string): Promise<RoomState> {
    const room = this.requireRoom(roomId);
    const people: { userId: string; name: string; role: Role; sheetId: string | null; editsItems?: boolean }[] = [];
    for (const m of this.store.members(roomId)) {
      const found = await this.db.select().from(users).where(eq(users.id, m.userId));
      people.push({ userId: m.userId, name: found[0]?.name ?? say`неизвестен`, role: m.role, sheetId: m.sheetId, ...(m.editsItems ? { editsItems: true } : {}) });
    }
    const pending = this.store.pending<PendingRecord>(roomId);
    const sheets = this.store.sheets(roomId);
    return {
      id: room.id, title: room.title, ...this.worldOf(room), sheets, members: people,
      log: this.store.log(roomId), clock: this.store.clock(roomId) ?? idleClock(), places: this.store.places(roomId),
      pending: pending ? this.pendingView(pending, sheets, this.worldOf(room).system) : null,
    };
  }

  async journal(userId: string, roomId: string): Promise<JournalEntry[]> {
    this.requireRoom(roomId);
    const me = this.store.members(roomId).find(member => member.userId === userId);
    if (!me) throw new ForbiddenException(say`журнал стола видят его участники`);
    const rows = await this.db.select().from(roomJournal).where(eq(roomJournal.roomId, roomId)).orderBy(asc(roomJournal.seq));
    const sight = this.sight(roomId, userId);
    const { gm } = sight;
    const closed = (input: { sheetId?: unknown; tag?: unknown }): boolean => {
      if (gm || typeof input?.tag !== 'string' || typeof input.sheetId !== 'string') return false;
      return !knows(sight.sheets, sight, { id: input.sheetId }, findField(sight.system, input.tag));
    };
    return rows.map(row => {
      const input = JSON.parse(row.input) as { hidden?: boolean; sheetId?: unknown; tag?: unknown };
      const result = JSON.parse(row.result) as RoomDelta;
      const secret = !gm && (Boolean(input?.hidden) || (result.log ?? []).some(entry => entry.hidden) || Boolean(result.pending?.hidden));
      const shown = (row.op === 'set' || row.op === 'shift') && closed(input) ? { sheetId: input.sheetId, tag: input.tag } : input;
      return {
        seq: row.seq, at: row.at, userId: row.userId, op: row.op,
        input: secret ? { hidden: true } : shown, dice: secret ? [] : JSON.parse(row.dice), result: seenBy(result, sight),
      };
    });
  }

  act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    const op: Op = {
      op: 'act',
      intent: {
        actionId: intent.actionId, fromId: intent.fromId, toIds: targetsOf(intent),
        ...(intent.inputs ? { inputs: intent.inputs } : {}),
        ...(intent.claims && Object.keys(intent.claims).length ? { claims: intent.claims } : {}),
      },
    };
    return this.world(intent.roomId, userId, 'act', intent, op, Boolean(intent.hidden));
  }

  turn(userId: string, intent: TurnIntent): Promise<RoomDelta> {
    return this.world(intent.roomId, userId, 'turn', intent, { op: 'turn', turn: intent.op, ...(intent.order ? { order: intent.order } : {}), ...(intent.who ? { who: intent.who } : {}), ...(intent.seconds ? { seconds: intent.seconds } : {}) }, false);
  }

  setValue(userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue): Promise<RoomDelta> {
    return this.world(roomId, userId, 'set', { sheetId, tag, value }, { op: 'set', sheetId, tag, value }, false);
  }

  shiftValue(userId: string, roomId: string, sheetId: string, tag: string, by: number): Promise<RoomDelta> {
    return this.world(roomId, userId, 'shift', { sheetId, tag, by }, { op: 'shift', sheetId, tag, by }, false);
  }

  rollField(userId: string, roomId: string, sheetId: string, tag: string, hidden = false, claims: string[] = [], second?: string, versus?: number): Promise<RoomDelta> {
    const claimed = {
      ...(claims.length ? { claims } : {}),
      ...(second ? { second } : {}),
      ...(versus !== undefined ? { versus } : {}),
    };
    return this.world(roomId, userId, 'roll', { sheetId, tag, ...(hidden ? { hidden } : {}), ...claimed }, { op: 'roll', sheetId, tag, ...claimed }, hidden);
  }

  createSheet(userId: string, roomId: string, name: string, of?: string): Promise<RoomDelta> {
    return this.world(roomId, userId, 'sheet', { name, of }, { op: 'sheet', name, ...(of ? { of } : {}) }, false);
  }

  setBelonging(
    userId: string, roomId: string, sheetId: string, list: 'has' | 'effects', id: string, on: boolean, off?: boolean,
    item: { inst?: string; add?: boolean; in?: string | null } = {},
  ): Promise<RoomDelta> {
    const extra = {
      ...(item.inst !== undefined ? { inst: item.inst } : {}),
      ...(item.add ? { add: true } : {}),
      ...(item.in !== undefined ? { in: item.in } : {}),
    };
    return this.world(roomId, userId, 'belonging', { sheetId, list, id, on, off, ...extra },
      { op: 'belonging', sheetId, list, id, on, ...(off !== undefined ? { off } : {}), ...extra }, false);
  }

  dropSheet(userId: string, roomId: string, sheetId: string): Promise<RoomDelta> {
    return this.world(roomId, userId, 'drop', { sheetId }, { op: 'drop', sheetId }, false);
  }

  setSheetKind(userId: string, roomId: string, sheetId: string, of: string | null): Promise<RoomDelta> {
    return this.world(roomId, userId, 'kind', { sheetId, of }, { op: 'kind', sheetId, of }, false);
  }

  setSheetGroup(userId: string, roomId: string, sheetId: string, group: string | null): Promise<RoomDelta> {
    return this.world(roomId, userId, 'group', { sheetId, group }, { op: 'group', sheetId, group }, false);
  }

  answer(userId: string, intent: AnswerIntent): Promise<RoomDelta> {
    return this.inTurn(intent.roomId, () => {
      const room = this.requireRoom(intent.roomId);
      const record = this.store.pending<PendingRecord>(intent.roomId);
      if (!record || record.id !== intent.pendingId) throw new BadRequestException(say`стол никого не ждёт — этот вопрос уже закрыт`);
      this.allow(room, userId, { kind: 'answer', sheetId: record.question.sheetId });
      const offered = new Set(record.question.offers.map(o => o.id));
      const stray = intent.chosen.find(id => !offered.has(id));
      if (stray) throw new BadRequestException(say`реакция «${stray}» сейчас не предлагается; можно: ${[...offered].join(', ') || say`(ничего)`}`);
      if (record.question.one && intent.chosen.length !== 1) throw new BadRequestException(`${inTongue(langNow(), askOneWords)}: ${record.question.offers.map(o => o.label).join(' / ')}`);
      const { question, id: _id, ...rest } = record;
      const journal: Journal = { ...record.journal, answers: { ...record.journal.answers, [question.key]: intent.chosen } };
      return this.play(room, { ...rest, journal }, userId, 'answer', intent, true);
    });
  }

  cancel(userId: string, intent: CancelIntent): Promise<RoomDelta> {
    return this.inTurn(intent.roomId, () => {
      const room = this.requireRoom(intent.roomId);
      this.allow(room, userId, { kind: 'cancel' });
      const record = this.store.pending<PendingRecord>(intent.roomId);
      if (!record || record.id !== intent.pendingId) throw new BadRequestException(say`стол никого не ждёт — этот вопрос уже закрыт`);
      const sheets = this.changed(this.store.sheets(intent.roomId), record.snapshot);
      const told = sayIn(mainLang(this.worldOf(room).system));
      const log = this.lines([told`Ведущий отменил действие: всё вернулось как было до него`], false);
      const delta: RoomDelta = { roomId: intent.roomId, sheets, log, clock: record.clock, pending: null };
      this.store.commit({ roomId: intent.roomId, sheets, clock: record.clock, pending: null, log: this.rows(log), journal: this.journalRow(userId, 'cancel', intent, [], delta) });
      this.emit(delta);
      return delta;
    });
  }

  claimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      if (sheetId && !this.store.sheets(roomId).some(sheet => sheet.id === sheetId)) throw new NotFoundException(say`в комнате нет листа «${sheetId}»`);
      this.allow(room, userId, { kind: 'claim', sheetId }, true);
      const delta: RoomDelta = { roomId, sheets: [], log: [] };
      this.store.commit({ roomId, member: { userId, sheetId }, journal: this.journalRow(userId, 'claim', { sheetId }, [], delta) });
      return delta;
    });
  }

  allowItems(userId: string, roomId: string, whoId: string, on: boolean): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      this.allow(room, userId, { kind: 'items', userId: whoId });
      const delta: RoomDelta = { roomId, sheets: [], log: [] };
      this.store.commit({ roomId, items: { userId: whoId, on }, journal: this.journalRow(userId, 'items', { userId: whoId, on }, [], delta) });
      return delta;
    });
  }

  placePiece(userId: string, roomId: string, sheetId: string, at: Place | null): Promise<Places> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      this.allow(room, userId, { kind: 'place', sheetId }, true);
      const places = { ...this.store.places(roomId) };
      if (at) {
        const taken = Object.entries(places).find(([id, one]) => id !== sheetId && one.x === at.x && one.y === at.y);
        if (taken) throw new BadRequestException(say`клетка занята`);
        places[sheetId] = { x: at.x, y: at.y };
      } else delete places[sheetId];
      this.store.savePlaces(roomId, places);
      return places;
    });
  }

  enter<T>(roomId: string, work: (state: RoomState) => T | Promise<T>): Promise<T> {
    return this.inTurn(roomId, async () => work(await this.state(roomId)));
  }

  async listFor(userId: string): Promise<RoomSummary[]> {
    const all = await this.db.select().from(rooms).orderBy(desc(rooms.createdAt));
    const seats = await this.db.select().from(members);
    const names = new Map((await this.db.select().from(users)).map(user => [user.id, user.name]));
    const mine = new Set(seats.filter(m => m.userId === userId).map(m => m.roomId));
    return all
      .map(room => {
        const at = seats.filter(m => m.roomId === room.id);
        const gm = at.find(m => m.role === 'gm');
        return {
          id: room.id, title: room.title, worldId: room.worldId, memberCount: at.length, createdAt: room.createdAt,
          gmName: gm ? names.get(gm.userId) ?? say`неизвестен` : '—', gm: openTable() ? mine.has(room.id) : gm?.userId === userId,
        };
      })
      .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));
  }

  private world(roomId: string, userId: string, name: string, input: unknown, op: Op, hidden: boolean): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      this.allow(room, userId, { kind: 'world', op, hidden });
      const snapshot = this.store.sheets(roomId);
      const waiting = this.store.pending<PendingRecord>(roomId);
      if (waiting) {
        const who = snapshot.find(s => s.id === waiting.question.sheetId)?.name ?? waiting.question.sheetId;
        throw new BadRequestException(say`стол ждёт ответа: ${who} решает, применить ли реакцию`);
      }
      const started: Started = {
        roomId, op, userId, hidden, clock: this.store.clock(roomId) ?? idleClock(), snapshot, journal: emptyJournal(), logged: 0,
      };
      return this.play(room, started, userId, name, input, false);
    });
  }

  private allow(room: RoomRow, userId: string, want: Want, refusalIsBad = false): void {
    const why = inTongue(langNow(), () => authorize({
      system: this.worldOf(room).system, sheets: this.store.sheets(room.id), members: this.store.members(room.id), clock: this.store.clock(room.id),
    }, userId, want));
    if (!why) return;
    if (refusalIsBad && this.store.members(room.id).some(member => member.userId === userId)) throw new BadRequestException(why);
    throw new ForbiddenException(why);
  }

  private play(room: RoomRow, record: Started, userId: string, name: string, input: unknown, resumed: boolean): RoomDelta {
    const { system, compendium } = this.worldOf(room);
    const dice: number[] = [];
    let out: Performed;
    try {
      out = perform({
        system, compendium, clock: record.clock, sheets: record.snapshot, journal: record.journal, newId: this.newId,
        die: sides => { const value = this.die(sides); dice.push(value); return value; },
      }, record.op);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = (err as Error).message;
      if (err instanceof EngineError && err.code === NO_SHEET) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
    const was = this.store.sheets(room.id);
    const sheets = this.changed(was, out.sheets);
    const gone = was.filter(sheet => !out.sheets.some(next => next.id === sheet.id)).map(sheet => sheet.id);
    const log = this.lines(out.log.slice(record.logged), record.hidden, out.lines.slice(record.logged));
    const clock = (out.clock ?? idleClock()) as ClockState;
    const turned = JSON.stringify(clock) !== JSON.stringify(record.clock);
    if (out.kind === 'done') {
      const delta: RoomDelta = {
        roomId: room.id, sheets, log, ...(gone.length ? { gone } : {}),
        ...(record.op.op === 'act' || record.op.op === 'turn' || turned ? { clock } : {}),
        ...(resumed ? { pending: null } : {}),
      };
      this.store.commit({
        roomId: room.id, sheets, ...(gone.length ? { gone } : {}), ...(turned ? { clock } : {}), ...(resumed ? { pending: null } : {}), log: this.rows(log),
        journal: this.journalRow(userId, name, input, dice, delta),
      });
      this.emit(delta);
      return delta;
    }
    const id = this.newId();
    const pending: PendingRecord = { ...record, id, journal: out.journal as Journal, question: out.question, logged: out.log.length };
    const view = this.pendingView(pending, out.sheets, system);
    const told = sayIn(mainLang(system));
    const asked = out.sheets.find(s => s.id === out.question.sheetId);
    const waiting = this.lines([view.one
      ? `${view.question} — ${view.options.map(o => o.label).join(' / ')}`
      : told`${asked?.name ?? out.question.sheetId}: стол ждёт решения — ${view.options.map(o => o.label).join(', ')}`], record.hidden);
    const delta: RoomDelta = { roomId: room.id, sheets, log: [...log, ...waiting], clock: record.clock, pending: view };
    this.store.commit({
      roomId: room.id, sheets, pending: { id, data: JSON.stringify(pending) }, log: this.rows([...log, ...waiting]),
      journal: this.journalRow(userId, name, input, dice, delta),
    });
    this.emit(delta);
    return delta;
  }

  private changed(current: readonly Sheet[], next: readonly Sheet[]): Sheet[] {
    const was = new Map(current.map(s => [s.id, JSON.stringify(s)]));
    return next.filter(sheet => was.get(sheet.id) !== JSON.stringify(sheet));
  }

  private lines(texts: string[], hidden: boolean, parts: (string[] | null)[] = []): LogEntry[] {
    return texts.map((text, at) => ({
      id: this.newId(), at: this.now(), text, ...(parts[at] ? { lines: parts[at]! } : {}), ...(hidden ? { hidden: true } : {}),
    }));
  }

  private rows(log: LogEntry[]): { id: string; at: string; text: string; lines: string | null; hidden: boolean }[] {
    return log.map(entry => ({ id: entry.id, at: entry.at, text: entry.text, lines: entry.lines ? JSON.stringify(entry.lines) : null, hidden: Boolean(entry.hidden) }));
  }

  private journalRow(userId: string, op: string, input: unknown, dice: number[], delta: RoomDelta) {
    return { at: this.now(), userId, op, input: JSON.stringify(input ?? null), dice: JSON.stringify(dice), result: JSON.stringify(delta) };
  }

  private emit(delta: RoomDelta): void {
    for (const listener of this.listeners) listener(delta);
  }

  private pendingView(record: PendingRecord, sheets: readonly Sheet[], system: System): PendingState {
    const { question } = record;
    const told = sayIn(mainLang(system));
    const name = sheets.find(s => s.id === question.sheetId)?.name ?? question.sheetId;
    const by = question.label ? told` ответкой «${question.label}»` : '';
    return {
      id: String(record.id),
      sheetId: question.sheetId,
      stage: question.window,
      question: question.window === 'step'
        ? `${question.sheetId === DESK_ID ? inSystemTongue(system, askDeskTitle) : name}: ${question.label}`
        : question.window === 'moment'
        ? told`${name}: ${question.label} — воспользоваться?`
        : question.window === 'seen'
        ? told`${name}: кости выпали — воспользоваться?`
        : question.window === 'after'
          ? told`${name}: на вас подействовали${by} — ответить реакцией?`
          : told`${name}: на вас действуют${by} — ответить реакцией?`,
      options: question.offers.map(o => ({ id: o.id, label: o.label })),
      preview: question.preview,
      ...(question.one ? { one: true } : {}),
      ...(record.hidden ? { hidden: true } : {}),
    };
  }

  private requireRoom(roomId: string) {
    const room = this.store.room(roomId);
    if (!room) throw new NotFoundException(say`комнаты «${roomId}» нет`);
    return room;
  }

  private inTurn<T>(roomId: string, work: () => T | Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(roomId, next);
    next.finally(() => { if (this.queues.get(roomId) === next) this.queues.delete(roomId); }).catch(() => undefined);
    return next;
  }
}
