import { seenBy } from './visibility.ts';
import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { eq, asc, desc } from 'drizzle-orm';
import { DB, RAW, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import type { DatabaseSync } from 'node:sqlite';
import { rooms, roomSheets, roomJournal, members, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { RoomStore } from './store.ts';
import type {
  RoomState, RoomSummary, RoomDelta, JournalEntry, ActIntent, TurnIntent, AnswerIntent, CancelIntent, ClockState, PendingState,
  Sheet, System, Compendium, StoredValue, LogEntry,
} from '@vtt/schema';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { perform } from '@vtt/engine/core/perform';
import { authorize } from '@vtt/engine/core/authorize';
import { emptyJournal } from '@vtt/engine/core/external';
import type { Op, Performed } from '@vtt/engine/core/perform';
import type { Want } from '@vtt/engine/core/authorize';
import type { Journal, Question } from '@vtt/engine/core/external';
import { deskOf, hasDesk } from '@vtt/engine/events/desk';
import { DESK_ID } from '@vtt/engine/engine/owners';
import { idleClock } from '@vtt/engine/engine/clock';
import { EngineError } from '@vtt/engine/engine/errors';

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

const targetsOf = (intent: ActIntent): string[] =>
  (intent.toIds?.length ? [...new Set(intent.toIds)] : [intent.toId]);

const missing = (message: string): boolean => /^в комнате нет листа/.test(message);

@Injectable()
export class RoomsService {
  private readonly store: RoomStore;
  private readonly listeners = new Set<(delta: RoomDelta) => void>();
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

  private worldOf(room: RoomRow): { system: System; compendium: Compendium } {
    return { system: flattenSystem(JSON.parse(room.system) as System), compendium: JSON.parse(room.compendium) as Compendium };
  }

  async create(userId: string, worldId: string, title: string): Promise<RoomSummary> {
    const world = await this.worldsService.get(worldId);
    const id = this.newId();
    await this.db.insert(rooms).values({
      id, title, worldId, system: JSON.stringify(world.system), compendium: JSON.stringify(world.compendium), createdAt: this.now(),
    });
    const withDesk = hasDesk(world.system) && !deskOf(world.sheets)
      ? [...world.sheets, { id: DESK_ID, systemId: world.system.id, name: 'Стол', values: {}, has: [], effects: [] } as Sheet]
      : world.sheets;
    for (const sheet of withDesk) await this.db.insert(roomSheets).values({ roomId: id, sheetId: sheet.id, data: JSON.stringify(sheet) });
    await this.db.insert(members).values({ roomId: id, userId, role: 'gm', sheetId: null });
    return { id, title, worldId, memberCount: 1 };
  }

  async join(userId: string, roomId: string): Promise<void> {
    this.requireRoom(roomId);
    if (this.store.members(roomId).some(member => member.userId === userId)) return;
    await this.db.insert(members).values({ roomId, userId, role: 'player', sheetId: null });
  }

  async state(roomId: string): Promise<RoomState> {
    const room = this.requireRoom(roomId);
    const people: { userId: string; name: string; role: Role; sheetId: string | null }[] = [];
    for (const m of this.store.members(roomId)) {
      const found = await this.db.select().from(users).where(eq(users.id, m.userId));
      people.push({ userId: m.userId, name: found[0]?.name ?? 'неизвестен', role: m.role, sheetId: m.sheetId });
    }
    const pending = this.store.pending<PendingRecord>(roomId);
    const sheets = this.store.sheets(roomId);
    return {
      id: room.id, title: room.title, ...this.worldOf(room), sheets, members: people,
      log: this.store.log(roomId), clock: this.store.clock(roomId) ?? idleClock(),
      pending: pending ? this.pendingView(pending, sheets) : null,
    };
  }

  async journal(userId: string, roomId: string): Promise<JournalEntry[]> {
    this.requireRoom(roomId);
    const me = this.store.members(roomId).find(member => member.userId === userId);
    if (!me) throw new ForbiddenException('журнал стола видят его участники');
    const rows = await this.db.select().from(roomJournal).where(eq(roomJournal.roomId, roomId)).orderBy(asc(roomJournal.seq));
    const gm = me.role === 'gm';
    return rows.map(row => {
      const input = JSON.parse(row.input) as { hidden?: boolean };
      const result = JSON.parse(row.result) as RoomDelta;
      const secret = !gm && (Boolean(input?.hidden) || (result.log ?? []).some(entry => entry.hidden) || Boolean(result.pending?.hidden));
      return {
        seq: row.seq, at: row.at, userId: row.userId, op: row.op,
        input: secret ? { hidden: true } : input, dice: secret ? [] : JSON.parse(row.dice), result: seenBy(result, !secret),
      };
    });
  }

  act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    const op: Op = {
      op: 'act',
      intent: {
        actionId: intent.actionId, fromId: intent.fromId, toIds: targetsOf(intent),
        ...(intent.inputs ? { inputs: intent.inputs } : {}),
        ...(intent.edits?.length ? { edits: intent.edits } : {}),
        ...(intent.targetEdits?.length ? { targetEdits: intent.targetEdits } : {}),
      },
    };
    return this.world(intent.roomId, userId, 'act', intent, op, Boolean(intent.hidden));
  }

  turn(userId: string, intent: TurnIntent): Promise<RoomDelta> {
    return this.world(intent.roomId, userId, 'turn', intent, { op: 'turn', turn: intent.op, ...(intent.order ? { order: intent.order } : {}) }, false);
  }

  setValue(userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue): Promise<RoomDelta> {
    return this.world(roomId, userId, 'set', { sheetId, tag, value }, { op: 'set', sheetId, tag, value }, false);
  }

  rollField(userId: string, roomId: string, sheetId: string, tag: string, hidden = false): Promise<RoomDelta> {
    return this.world(roomId, userId, 'roll', { sheetId, tag, ...(hidden ? { hidden } : {}) }, { op: 'roll', sheetId, tag }, hidden);
  }

  createSheet(userId: string, roomId: string, name: string, of?: string): Promise<RoomDelta> {
    return this.world(roomId, userId, 'sheet', { name, of }, { op: 'sheet', name, ...(of ? { of } : {}) }, false);
  }

  setBelonging(userId: string, roomId: string, sheetId: string, list: 'has' | 'effects', id: string, on: boolean, off?: boolean): Promise<RoomDelta> {
    return this.world(roomId, userId, 'belonging', { sheetId, list, id, on, off },
      { op: 'belonging', sheetId, list, id, on, ...(off !== undefined ? { off } : {}) }, false);
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
      if (!record || record.id !== intent.pendingId) throw new BadRequestException('стол никого не ждёт — этот вопрос уже закрыт');
      this.allow(room, userId, { kind: 'answer', sheetId: record.question.sheetId });
      const offered = new Set(record.question.offers.map(o => o.id));
      const stray = intent.chosen.find(id => !offered.has(id));
      if (stray) throw new BadRequestException(`реакция «${stray}» сейчас не предлагается; можно: ${[...offered].join(', ') || '(ничего)'}`);
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
      if (!record || record.id !== intent.pendingId) throw new BadRequestException('стол никого не ждёт — этот вопрос уже закрыт');
      const sheets = this.changed(this.store.sheets(intent.roomId), record.snapshot);
      const log = this.lines(['Ведущий отменил действие: всё вернулось как было до него'], false);
      const delta: RoomDelta = { roomId: intent.roomId, sheets, log, clock: record.clock, pending: null };
      this.store.commit({ roomId: intent.roomId, sheets, clock: record.clock, pending: null, log: this.rows(log), journal: this.journalRow(userId, 'cancel', intent, [], delta) });
      this.emit(delta);
      return delta;
    });
  }

  claimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      if (sheetId && !this.store.sheets(roomId).some(sheet => sheet.id === sheetId)) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
      this.allow(room, userId, { kind: 'claim', sheetId }, true);
      const delta: RoomDelta = { roomId, sheets: [], log: [] };
      this.store.commit({ roomId, member: { userId, sheetId }, journal: this.journalRow(userId, 'claim', { sheetId }, [], delta) });
      return delta;
    });
  }

  enter<T>(roomId: string, work: (state: RoomState) => T | Promise<T>): Promise<T> {
    return this.inTurn(roomId, async () => work(await this.state(roomId)));
  }

  async listFor(userId: string): Promise<RoomSummary[]> {
    const all = await this.db.select().from(rooms).orderBy(desc(rooms.createdAt));
    const seats = await this.db.select().from(members);
    const mine = new Set(seats.filter(m => m.userId === userId).map(m => m.roomId));
    return all
      .map(room => ({ id: room.id, title: room.title, worldId: room.worldId, memberCount: seats.filter(m => m.roomId === room.id).length }))
      .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));
  }

  async isGm(roomId: string, userId: string): Promise<boolean> {
    return this.store.members(roomId).some(member => member.userId === userId && member.role === 'gm');
  }

  private world(roomId: string, userId: string, name: string, input: unknown, op: Op, hidden: boolean): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const room = this.requireRoom(roomId);
      this.allow(room, userId, { kind: 'world', op, hidden });
      const snapshot = this.store.sheets(roomId);
      const waiting = this.store.pending<PendingRecord>(roomId);
      if (waiting) {
        const who = snapshot.find(s => s.id === waiting.question.sheetId)?.name ?? waiting.question.sheetId;
        throw new BadRequestException(`стол ждёт ответа: ${who} решает, применить ли реакцию`);
      }
      const started: Started = {
        roomId, op, userId, hidden, clock: this.store.clock(roomId) ?? idleClock(), snapshot, journal: emptyJournal(), logged: 0,
      };
      return this.play(room, started, userId, name, input, false);
    });
  }

  private allow(room: RoomRow, userId: string, want: Want, refusalIsBad = false): void {
    const why = authorize({ system: this.worldOf(room).system, sheets: this.store.sheets(room.id), members: this.store.members(room.id) }, userId, want);
    if (!why) return;
    if (refusalIsBad && why !== 'вы не в этой комнате') throw new BadRequestException(why);
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
      if (err instanceof EngineError && missing(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
    const sheets = this.changed(this.store.sheets(room.id), out.sheets);
    const log = this.lines(out.log.slice(record.logged), record.hidden);
    const clock = (out.clock ?? idleClock()) as ClockState;
    const turned = JSON.stringify(clock) !== JSON.stringify(record.clock);
    if (out.kind === 'done') {
      const delta: RoomDelta = {
        roomId: room.id, sheets, log,
        ...(record.op.op === 'act' || record.op.op === 'turn' || turned ? { clock } : {}),
        ...(resumed ? { pending: null } : {}),
      };
      this.store.commit({
        roomId: room.id, sheets, ...(turned ? { clock } : {}), ...(resumed ? { pending: null } : {}), log: this.rows(log),
        journal: this.journalRow(userId, name, input, dice, delta),
      });
      this.emit(delta);
      return delta;
    }
    const id = this.newId();
    const pending: PendingRecord = { ...record, id, journal: out.journal as Journal, question: out.question, logged: out.log.length };
    const view = this.pendingView(pending, out.sheets);
    const asked = out.sheets.find(s => s.id === out.question.sheetId);
    const waiting = this.lines([`${asked?.name ?? out.question.sheetId}: стол ждёт решения — ${view.options.map(o => o.label).join(', ')}`], record.hidden);
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

  private lines(texts: string[], hidden: boolean): LogEntry[] {
    return texts.map(text => ({ id: this.newId(), at: this.now(), text, ...(hidden ? { hidden: true } : {}) }));
  }

  private rows(log: LogEntry[]): { id: string; at: string; text: string; hidden: boolean }[] {
    return log.map(entry => ({ id: entry.id, at: entry.at, text: entry.text, hidden: Boolean(entry.hidden) }));
  }

  private journalRow(userId: string, op: string, input: unknown, dice: number[], delta: RoomDelta) {
    return { at: this.now(), userId, op, input: JSON.stringify(input ?? null), dice: JSON.stringify(dice), result: JSON.stringify(delta) };
  }

  private emit(delta: RoomDelta): void {
    for (const listener of this.listeners) listener(delta);
  }

  private pendingView(record: PendingRecord, sheets: readonly Sheet[]): PendingState {
    const { question } = record;
    const name = sheets.find(s => s.id === question.sheetId)?.name ?? question.sheetId;
    const by = question.label ? ` ответкой «${question.label}»` : '';
    return {
      id: String(record.id),
      sheetId: question.sheetId,
      stage: question.window,
      question: question.window === 'seen'
        ? `${name}: кости выпали — воспользоваться?`
        : question.window === 'after'
          ? `${name}: на вас подействовали${by} — ответить реакцией?`
          : `${name}: на вас действуют${by} — ответить реакцией?`,
      options: question.offers.map(o => ({ id: o.id, label: o.label })),
      preview: question.preview,
      ...(record.hidden ? { hidden: true } : {}),
    };
  }

  private requireRoom(roomId: string) {
    const room = this.store.room(roomId);
    if (!room) throw new NotFoundException(`комнаты «${roomId}» нет`);
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
