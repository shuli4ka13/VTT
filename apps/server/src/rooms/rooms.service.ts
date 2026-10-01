import { seenBy } from './visibility.ts';
import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { and, eq, ne, asc, desc } from 'drizzle-orm';
import { DB, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { rooms, roomSheets, roomClocks, roomPending, roomJournal, members, logEntries, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { world as W } from '@vtt/schema';
import type {
  RoomState, RoomSummary, RoomDelta, JournalEntry, ActIntent, TurnIntent, AnswerIntent, CancelIntent, ClockState, PendingState,
  Sheet, System, Compendium, StoredValue,
} from '@vtt/schema';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { findRecord, sheetKindOf } from '@vtt/engine/model/owned';
import { effectLabelOf } from '@vtt/engine/events/actions';
import { findEffect, usesMax } from '@vtt/engine/engine/effects';
import { asksOf, checkInputs, normalizeInputs } from '@vtt/engine/model/asks';
import { fireMoments, describeMoment, momentsOfTurn } from '@vtt/engine/events/moments';
import { settle as settleSheets } from '@vtt/engine/events/settle';
import { act } from '@vtt/engine/lang/act';
import { checkSeen, initiativeSeen } from '@vtt/engine/lang/check';
import type { ActOutcome } from '@vtt/engine/lang/act';
import { emptyJournal } from '@vtt/engine/lang/journal';
import type { Journal, Question } from '@vtt/engine/lang/journal';
import { deskOf, sharedOf, hasDesk } from '@vtt/engine/events/desk';
import { newPass } from '@vtt/engine/engine/calc';
import { fieldOf } from '@vtt/engine/model/sheet-columns';
import { DESK_ID, isDesk } from '@vtt/engine/engine/owners';
import { fieldCheck } from '@vtt/engine/engine/check';
import {
  idleClock, startCombat, stopCombat, nextTurn, expiryOf, inCombat,
} from '@vtt/engine/engine/clock';
import { newBreaches } from '@vtt/engine/engine/limits';

export type Role = 'gm' | 'player';

interface PendingRecord {
  id?: string;
  roomId: string;
  intent: ActIntent;
  clock: ClockState;
  snapshot: Sheet[];
  journal: Journal;
  question: Question;
  logged: number;
}

const targetsOf = (intent: ActIntent): string[] =>
  (intent.toIds?.length ? [...new Set(intent.toIds)] : [intent.toId]);

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
    @Inject(DIE) private readonly die: (sides: number) => number,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
  ) {}

  private worldOf(room: { system: string; compendium: string }): { system: System; compendium: Compendium } {
    const system = JSON.parse(room.system) as System;
    const compendium = JSON.parse(room.compendium) as Compendium;
    return { system: flattenSystem(system), compendium };
  }

  async create(userId: string, worldId: string, title: string): Promise<RoomSummary> {
    const world = await this.worldsService.get(worldId);
    const id = this.newId();

    await this.db.insert(rooms).values({
      id, title, worldId,
      system: JSON.stringify(world.system),
      compendium: JSON.stringify(world.compendium),
      createdAt: this.now(),
    });
    const withDesk = hasDesk(world.system) && !deskOf(world.sheets)
      ? [...world.sheets, { id: DESK_ID, systemId: world.system.id, name: 'Стол', values: {}, has: [], effects: [] } as Sheet]
      : world.sheets;
    for (const sheet of withDesk) {
      await this.db.insert(roomSheets).values({
        roomId: id, sheetId: sheet.id, data: JSON.stringify(sheet),
      });
    }
    await this.db.insert(members).values({ roomId: id, userId, role: 'gm', sheetId: null });

    return { id, title, worldId, memberCount: 1 };
  }

  async join(userId: string, roomId: string): Promise<void> {
    await this.requireRoom(roomId);
    const existing = await this.memberOf(roomId, userId);
    if (existing) return;
    await this.db.insert(members).values({ roomId, userId, role: 'player', sheetId: null });
  }

  async state(roomId: string): Promise<RoomState> {
    const room = await this.requireRoom(roomId);
    const sheetRows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, roomId));
    const memberRows = await this.db.select().from(members)
      .where(eq(members.roomId, roomId));

    const people: { userId: string; name: string; role: Role; sheetId: string | null }[] = [];
    for (const m of memberRows) {
      const found = await this.db.select().from(users).where(eq(users.id, m.userId));
      people.push({
        userId: m.userId, name: found[0]?.name ?? 'неизвестен',
        role: m.role === 'gm' ? 'gm' : 'player', sheetId: m.sheetId ?? null,
      });
    }

    return {
      id: room.id,
      title: room.title,
      ...this.worldOf(room),
      sheets: sheetRows.map(r => JSON.parse(r.data) as Sheet),
      members: people,
      log: await this.log(roomId),
      clock: await this.clockOf(roomId),
      pending: await this.pendingOf(roomId),
    };
  }

  private async clockOf(roomId: string): Promise<ClockState> {
    const rows = await this.db.select().from(roomClocks).where(eq(roomClocks.roomId, roomId));
    const row = rows[0];
    return row ? JSON.parse(row.data) as ClockState : idleClock();
  }

  private async saveClock(roomId: string, clock: ClockState): Promise<void> {
    await this.db.delete(roomClocks).where(eq(roomClocks.roomId, roomId));
    await this.db.insert(roomClocks).values({ roomId, data: JSON.stringify(clock) });
  }

  turn(userId: string, intent: TurnIntent): Promise<RoomDelta> {
    return this.recorded(intent.roomId, userId, 'turn', intent, () => this.runTurn(userId, intent));
  }

  act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    return this.recorded(intent.roomId, userId, 'act', intent, () => this.runAct(userId, intent));
  }

  answer(userId: string, intent: AnswerIntent): Promise<RoomDelta> {
    return this.recorded(intent.roomId, userId, 'answer', intent, () => this.runAnswer(userId, intent));
  }

  cancel(userId: string, intent: CancelIntent): Promise<RoomDelta> {
    return this.recorded(intent.roomId, userId, 'cancel', intent, () => this.runCancel(userId, intent));
  }

  setValue(userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'set', { sheetId, tag, value }, () => this.runSetValue(userId, roomId, sheetId, tag, value));
  }

  rollField(userId: string, roomId: string, sheetId: string, tag: string, hidden = false): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'roll', { sheetId, tag, ...(hidden ? { hidden } : {}) }, () => this.runRollField(userId, roomId, sheetId, tag, hidden));
  }

  createSheet(userId: string, roomId: string, name: string, of?: string): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'sheet', { name, of }, () => this.runCreateSheet(userId, roomId, name, of));
  }

  setBelonging(
    userId: string, roomId: string, sheetId: string,
    list: 'has' | 'effects', id: string, on: boolean, off?: boolean,
  ): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'belonging', { sheetId, list, id, on, off },
      () => this.runSetBelonging(userId, roomId, sheetId, list, id, on, off));
  }

  setSheetKind(userId: string, roomId: string, sheetId: string, of: string | null): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'kind', { sheetId, of }, () => this.runSetSheetKind(userId, roomId, sheetId, of));
  }

  setSheetGroup(userId: string, roomId: string, sheetId: string, group: string | null): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'group', { sheetId, group }, () => this.runSetSheetGroup(userId, roomId, sheetId, group));
  }

  claimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    return this.recorded(roomId, userId, 'claim', { sheetId }, () => this.runClaimSheet(userId, roomId, sheetId));
  }

  async journal(userId: string, roomId: string): Promise<JournalEntry[]> {
    await this.requireRoom(roomId);
    if (!(await this.memberOf(roomId, userId))) throw new ForbiddenException('журнал стола видят его участники');
    const rows = await this.db.select().from(roomJournal).where(eq(roomJournal.roomId, roomId)).orderBy(asc(roomJournal.seq));
    const gm = await this.isGm(roomId, userId);
    return rows.map(row => {
      const input = JSON.parse(row.input) as { hidden?: boolean };
      const secret = Boolean(input?.hidden) && !gm;
      return {
        seq: row.seq, at: row.at, userId: row.userId, op: row.op,
        input, dice: secret ? [] : JSON.parse(row.dice), result: seenBy(JSON.parse(row.result), !secret),
      };
    });
  }

  private readonly rolling = new AsyncLocalStorage<number[]>();

  private readonly roll = (sides: number): number => {
    const value = this.die(sides);
    this.rolling.getStore()?.push(value);
    return value;
  };

  private recorded(roomId: string, userId: string, op: string, input: unknown, work: () => Promise<RoomDelta>): Promise<RoomDelta> {
    return this.inTurn(roomId, () => {
      const dice: number[] = [];
      return this.rolling.run(dice, async () => {
        const result = await work();
        const last = await this.db.select({ seq: roomJournal.seq }).from(roomJournal)
          .where(eq(roomJournal.roomId, roomId)).orderBy(desc(roomJournal.seq)).limit(1);
        await this.db.insert(roomJournal).values({
          roomId, seq: (last[0]?.seq ?? -1) + 1, at: this.now(), userId, op,
          input: JSON.stringify(input ?? null), dice: JSON.stringify(dice), result: JSON.stringify(result),
        });
        return result;
      });
    });
  }

  private async runTurn(userId: string, intent: TurnIntent): Promise<RoomDelta> {
    const room = await this.requireRoom(intent.roomId);
    if (!await this.memberOf(intent.roomId, userId)) {
      throw new ForbiddenException('вы не в этой комнате');
    }
    const { system, compendium } = this.worldOf(room);
    const rows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, intent.roomId));
    const sheets = rows.map(r => JSON.parse(r.data) as Sheet);
    const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;

    const waiting = await this.pendingOf(intent.roomId);
    if (waiting) {
      throw new BadRequestException(
        `стол ждёт ответа: ${nameOf(waiting.sheetId)} решает, применить ли реакцию — ход и сцену двигать рано`);
    }
    const clock = await this.clockOf(intent.roomId);

    let next: ClockState = clock;
    let after: Sheet[] = sheets;
    const lines: string[] = [];

    try {
      if (intent.op === 'start') {
        let order = intent.order ?? [];
        if (order.length) {
          const unknown = order.find(id => !sheets.some(s => s.id === id));
          if (unknown) throw new BadRequestException(`в комнате нет листа «${unknown}»`);
        } else {
          const rolled = initiativeSeen({ system, compendium, die: this.roll }, after);
          after = rolled.sheets;
          lines.push(...rolled.lines);
          order = rolled.order;
          if (rolled.rolls.length) {
            lines.push(`Инициатива: ${rolled.rolls
              .slice().sort((a, b) => b.total - a.total)
              .map(r => `${nameOf(r.sheetId)} ${r.total}`).join(', ')}`);
          }
        }
        next = startCombat(clock, order);
        lines.push(`Раунд 1. Ход: ${nameOf(String(next.active))}`);
      } else if (intent.op === 'next') {
        next = nextTurn(clock);
        lines.push(next.round !== clock.round
          ? `Раунд ${next.round}. Ход: ${nameOf(String(next.active))}`
          : `Ход: ${nameOf(String(next.active))}`);
      } else if (intent.op === 'stop') {
        next = stopCombat();
        lines.push('Бой окончен');
      } else if (intent.op === 'short-rest' || intent.op === 'long-rest') {
        if (inCombat(clock)) throw new BadRequestException('в бою не отдыхают — сначала закончите бой');
        lines.push(intent.op === 'long-rest' ? 'Долгий отдых' : 'Короткий отдых');
      } else {
        lines.push('Сцена закрыта');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException((err as Error).message);
    }

    try {
      const world = { system, compendium, die: this.roll, clock: next };
      const fired = fireMoments(momentsOfTurn(intent.op, clock, next, after), after, world);
      after = fired.sheets;
      for (const e of fired.expired ?? []) lines.push(`«${effectLabelOf(system, e.effectId)}» спало с ${nameOf(e.sheetId)}`);
      for (const entry of fired.reports) lines.push(describeMoment(world, entry, after));
      after = this.settle(world, sheets, after, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const touched: Sheet[] = [];
    for (const [i, sheet] of after.entries()) {
      if (sheet === sheets[i]) continue;
      await this.db.update(roomSheets).set({ data: JSON.stringify(sheet) })
        .where(and(eq(roomSheets.roomId, intent.roomId), eq(roomSheets.sheetId, sheet.id)));
      touched.push(sheet);
    }
    if (next !== clock) await this.saveClock(intent.roomId, next);
    const log = await this.appendLog(intent.roomId, lines);
    return { roomId: intent.roomId, sheets: touched, log, clock: next };
  }

  private async runAct(userId: string, intent: ActIntent): Promise<RoomDelta> {
    const room = await this.requireRoom(intent.roomId);
    if (!await this.memberOf(intent.roomId, userId)) {
      throw new ForbiddenException('вы не в этой комнате');
    }
    if (intent.hidden) await this.assertMayHide(intent.roomId, userId);
    const { system, compendium } = this.worldOf(room);
    const sheets = await this.sheetsOf(intent.roomId);
    await this.assertMaySheet(intent.roomId, userId, intent.fromId);
    await this.assertNotWaiting(intent.roomId, sheets);
    if (!sheets.some(s => s.id === intent.fromId)) throw new NotFoundException(`в комнате нет листа «${intent.fromId}»`);
    for (const id of targetsOf(intent)) if (!sheets.some(s => s.id === id)) throw new NotFoundException(`в комнате нет листа «${id}»`);

    let inputs: Record<string, number | string>;
    try {
      const asked = asksOf(intent.actionId, { system, compendium });
      const actor = sheets.find(s => s.id === intent.fromId)!;
      const trouble = checkInputs(asked, intent.inputs, system, newPass(system, actor, { compendium, shared: sharedOf(system, sheets) }));
      if (trouble) throw new BadRequestException(trouble);
      inputs = normalizeInputs(asked, intent.inputs);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException((err as Error).message);
    }
    const clock = await this.clockOf(intent.roomId);
    const fixed: ActIntent = { ...intent, ...(Object.keys(inputs).length ? { inputs } : {}) };
    return this.play({ roomId: intent.roomId, intent: fixed, clock, snapshot: sheets, journal: emptyJournal(), logged: 0 }, sheets, system, compendium);
  }

  private async play(
    record: Omit<PendingRecord, 'question'>, current: Sheet[], system: System, compendium: Compendium,
  ): Promise<RoomDelta> {
    const { intent } = record;
    let outcome: ActOutcome;
    try {
      outcome = act({
        system, compendium, clock: record.clock, sheets: record.snapshot, die: this.roll, journal: record.journal,
      }, {
        actionId: intent.actionId, fromId: intent.fromId, toIds: targetsOf(intent),
        ...(intent.inputs ? { inputs: intent.inputs } : {}),
        ...(intent.edits?.length ? { edits: intent.edits } : {}),
        ...(intent.targetEdits?.length ? { targetEdits: intent.targetEdits } : {}),
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
    const fresh = outcome.log.slice(record.logged);
    if (outcome.kind === 'done') {
      const touched = await this.persistSheets(record.roomId, current, outcome.sheets, []);
      await this.db.delete(roomPending).where(eq(roomPending.roomId, record.roomId));
      const log = await this.appendLog(record.roomId, fresh, Boolean(record.intent.hidden));
      return { roomId: record.roomId, sheets: touched, log, clock: record.clock, pending: null };
    }
    const id = this.newId();
    const pending: PendingRecord = { ...record, id, journal: outcome.journal, question: outcome.question, logged: outcome.log.length };
    await this.db.insert(roomPending).values({ id, roomId: record.roomId, data: JSON.stringify(pending) });
    await this.db.delete(roomPending).where(and(eq(roomPending.roomId, record.roomId), ne(roomPending.id, id)));
    const touched = await this.persistSheets(record.roomId, current, outcome.sheets, []);
    const asked = outcome.sheets.find(s => s.id === outcome.question.sheetId)!;
    const view = this.pendingView(pending, asked);
    const log = [
      ...await this.appendLog(record.roomId, fresh, Boolean(record.intent.hidden)),
      ...await this.appendLog(record.roomId, [`${asked.name}: стол ждёт решения — ${view.options.map(o => o.label).join(', ')}`]),
    ];
    return { roomId: record.roomId, sheets: touched, log, clock: record.clock, pending: view };
  }

  private async runAnswer(userId: string, intent: AnswerIntent): Promise<RoomDelta> {
    const room = await this.requireRoom(intent.roomId);
    if (!await this.memberOf(intent.roomId, userId)) {
      throw new ForbiddenException('вы не в этой комнате');
    }
    const record = await this.pendingRecord(intent.roomId);
    if (!record || record.id !== intent.pendingId) {
      throw new BadRequestException('стол никого не ждёт — этот вопрос уже закрыт');
    }
    await this.assertMaySheet(intent.roomId, userId, record.question.sheetId);
    const offered = new Set(record.question.offers.map(o => o.id));
    const stray = intent.chosen.find(id => !offered.has(id));
    if (stray) {
      throw new BadRequestException(`реакция «${stray}» сейчас не предлагается; можно: ${[...offered].join(', ') || '(ничего)'}`);
    }
    const { system, compendium } = this.worldOf(room);
    const current = await this.sheetsOf(intent.roomId);
    const journal: Journal = { ...record.journal, answers: { ...record.journal.answers, [record.question.key]: intent.chosen } };
    const { question: _question, id: _id, ...rest } = record;
    return this.play({ ...rest, journal }, current, system, compendium);
  }

  private async runCancel(userId: string, intent: CancelIntent): Promise<RoomDelta> {
    await this.requireRoom(intent.roomId);
    const me = await this.memberOf(intent.roomId, userId);
    if (me?.role !== 'gm') throw new ForbiddenException('отменить действие может только ведущий');
    const record = await this.pendingRecord(intent.roomId);
    if (!record || record.id !== intent.pendingId) {
      throw new BadRequestException('стол никого не ждёт — этот вопрос уже закрыт');
    }
    const current = await this.sheetsOf(intent.roomId);
    const touched = await this.persistSheets(intent.roomId, current, record.snapshot, []);
    await this.db.delete(roomPending).where(eq(roomPending.roomId, intent.roomId));
    const log = await this.appendLog(intent.roomId, ['Ведущий отменил действие: всё вернулось как было до него']);
    return { roomId: intent.roomId, sheets: touched, log, clock: record.clock, pending: null };
  }

  private async sheetsOf(roomId: string): Promise<Sheet[]> {
    const rows = await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId));
    return rows.map(r => JSON.parse(r.data) as Sheet);
  }

  private async assertNotWaiting(roomId: string, sheets: Sheet[]): Promise<void> {
    const waiting = await this.pendingRecord(roomId);
    if (!waiting) return;
    const who = sheets.find(s => s.id === waiting.question.sheetId)?.name ?? waiting.question.sheetId;
    throw new BadRequestException(`стол ждёт ответа: ${who} решает, применить ли реакцию`);
  }


  private async persistSheets(roomId: string, before: Sheet[], after: Sheet[], already: Sheet[]): Promise<Sheet[]> {
    const touched: Sheet[] = [...already];
    const was = new Map(before.map(s => [s.id, JSON.stringify(s)]));
    for (const sheet of after) {
      const next = JSON.stringify(sheet);
      if (was.get(sheet.id) === next && !already.some(s => s.id === sheet.id)) continue;
      await this.db.update(roomSheets).set({ data: next })
        .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheet.id)));
      if (!touched.some(s => s.id === sheet.id)) touched.push(sheet);
      else touched.splice(touched.findIndex(s => s.id === sheet.id), 1, sheet);
    }
    return touched;
  }

  private async pendingRecord(roomId: string): Promise<PendingRecord | null> {
    const rows = await this.db.select().from(roomPending).where(eq(roomPending.roomId, roomId));
    const row = rows[0];
    const record = row ? JSON.parse(row.data) as PendingRecord : null;
    return record?.question ? record : null;
  }

  private async pendingOf(roomId: string): Promise<PendingState | null> {
    const record = await this.pendingRecord(roomId);
    if (!record) return null;
    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, record.question.sheetId)));
    const asked = rows[0] ? JSON.parse(rows[0].data) as Sheet : null;
    return asked ? this.pendingView(record, asked) : null;
  }

  private pendingView(record: PendingRecord, asked: Sheet): PendingState {
    const { question } = record;
    const by = question.label ? ` ответкой «${question.label}»` : '';
    return {
      id: String(record.id),
      sheetId: asked.id,
      stage: question.window,
      question: question.window === 'seen'
        ? `${asked.name}: кости выпали — воспользоваться?`
        : question.window === 'after'
          ? `${asked.name}: на вас подействовали${by} — ответить реакцией?`
          : `${asked.name}: на вас действуют${by} — ответить реакцией?`,
      options: question.offers.map(o => ({ id: o.id, label: o.label })),
      preview: question.preview,
      ...(record.intent.hidden ? { hidden: true } : {}),
    };
  }


  private async runSetValue(
    userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertNotWaiting(roomId, await this.sheetsOf(roomId));
    await this.assertMaySheet(roomId, userId, sheetId);

    const { system } = this.worldOf(room);
    const field = fieldOf(system, tag);
    if (!field) throw new BadRequestException(`система не объявляет поля «${tag}»`);
    if (field.value.kind !== 'stored') {
      throw new BadRequestException(
        `поле «${field.label}» считает движок по правилу — вписать в него значение нельзя`);
    }

    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);

    const sheet = JSON.parse(row.data) as Sheet;
    const next: Sheet = { ...sheet, values: { ...sheet.values, [tag]: value } };

    const before = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => (entry.sheetId === sheetId ? sheet : JSON.parse(entry.data) as Sheet));
    this.assertWithinLimits(system, this.worldOf(room).compendium, sheet, next, before);
    const lines: string[] = [];
    let settled = before.map(entry => (entry.id === sheetId ? next : entry));
    try {
      const world = { system, compendium: this.worldOf(room).compendium, die: this.roll, clock: await this.clockOf(roomId) };
      settled = this.settle(world, before, settled, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const touched = await this.persistSheets(roomId, before, settled, [next]);
    const log = lines.length ? await this.appendLog(roomId, lines) : [];
    return { roomId, sheets: touched, log };
  }

  private async runSetSheetKind(userId: string, roomId: string, sheetId: string, of: string | null): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertNotWaiting(roomId, await this.sheetsOf(roomId));
    await this.assertMaySheet(roomId, userId, sheetId);
    const { system, compendium } = this.worldOf(room);
    if (of !== null && isDesk({ id: of })) throw new BadRequestException('тип «стол» только у стола комнаты');
    if (of !== null && !system.sheets?.[of]) {
      throw new BadRequestException(`система не объявляет типа листа «${of}»`);
    }
    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
    const sheet = JSON.parse(row.data) as Sheet;
    const { of: _was, ...rest } = sheet;
    void _was;
    const next: Sheet = of === null ? rest : { ...rest, of };

    const before = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => (entry.sheetId === sheetId ? sheet : JSON.parse(entry.data) as Sheet));
    const lines: string[] = [];
    let settled = before.map(entry => (entry.id === sheetId ? next : entry));
    try {
      const world = { system, compendium, die: this.roll, clock: await this.clockOf(roomId) };
      settled = this.settle(world, before, settled, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const touched = await this.persistSheets(roomId, before, settled, [next]);
    const log = lines.length ? await this.appendLog(roomId, lines) : [];
    return { roomId, sheets: touched, log };
  }

  private async runSetSheetGroup(userId: string, roomId: string, sheetId: string, group: string | null): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertNotWaiting(roomId, await this.sheetsOf(roomId));
    await this.assertMaySheet(roomId, userId, sheetId);
    const { system, compendium } = this.worldOf(room);
    const before = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => JSON.parse(entry.data) as Sheet);
    const sheet = before.find(entry => entry.id === sheetId);
    if (!sheet) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
    if (group !== null) {
      const holder = before.find(entry => entry.id === group);
      if (!holder) throw new BadRequestException(`в комнате нет листа «${group}»`);
      if (group === sheetId) throw new BadRequestException('лист не может быть группой самому себе');
      if (isDesk(holder)) throw new BadRequestException('стол и так общий для всех — группой его не назначают');
      if (before.some(entry => entry.group === sheetId)) throw new BadRequestException(`«${sheet.name}» — группа для других листов, в группу её не поставить`);
      if (holder.group) throw new BadRequestException(`«${holder.name}» сам состоит в группе — группы не вкладываются`);
    }
    const { group: _was, ...rest } = sheet;
    void _was;
    const next: Sheet = group === null ? rest : { ...rest, group };

    const lines: string[] = [group === null ? `«${sheet.name}» вышел из группы` : `«${sheet.name}» теперь в группе «${before.find(entry => entry.id === group)!.name}»`];
    let settled = before.map(entry => (entry.id === sheetId ? next : entry));
    try {
      const world = { system, compendium, die: this.roll, clock: await this.clockOf(roomId) };
      settled = this.settle(world, before, settled, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const touched = await this.persistSheets(roomId, before, settled, [next]);
    const log = await this.appendLog(roomId, lines);
    return { roomId, sheets: touched, log };
  }

  private async runRollField(userId: string, roomId: string, sheetId: string, tag: string, hidden = false): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (hidden) await this.assertMayHide(roomId, userId);
    await this.assertNotWaiting(roomId, await this.sheetsOf(roomId));
    await this.assertMaySheet(roomId, userId, sheetId);

    const { system, compendium } = this.worldOf(room);
    let check: ReturnType<typeof fieldCheck>;
    try {
      check = fieldCheck(system, tag);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
    const sheet = JSON.parse(row.data) as Sheet;
    const before = await this.sheetsOf(roomId);

    let line: string;
    let reacted: { sheets: Sheet[]; lines: string[] };
    try {
      const { rolled, bonus, total, edits, sheets: changed, lines: extra } = checkSeen({ system, compendium, die: this.roll }, before, sheet.id, check, check.label);
      reacted = { sheets: changed, lines: extra };
      const named = edits.length ? ` (${edits.join(', ')})` : '';
      const shown = rolled.kept != null && rolled.rolls.length > 1
        ? `[${rolled.rolls.join(', ')}] → ${rolled.kept}` : `[${rolled.rolls.join(', ')}]`;
      line = rolled.read === 'count'
        ? `${sheet.name} бросает «${check.label}»: ${shown}${named} — успехов: ${total}`
        : `${sheet.name} бросает «${check.label}»: ${shown}${named} + ${bonus} = ${total}`;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const touched = await this.persistSheets(roomId, before, reacted.sheets, []);
    const log = await this.appendLog(roomId, [line, ...reacted.lines], hidden);
    return { roomId, sheets: touched, log };
  }

  private async runCreateSheet(
    userId: string, roomId: string, name: string, of?: string,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const { system } = this.worldOf(room);

    if (of && !sheetKindOf(system, { of } as Sheet)) throw new BadRequestException(`в системе нет типа листа «${of}»`);

    const sheet = W.sheet.parse({
      id: this.newId(),
      systemId: system.id ?? '',
      ...(of ? { of } : {}),
      name,
      values: {},
      has: [],
      effects: [],
    });

    await this.db.insert(roomSheets).values({
      roomId, sheetId: sheet.id, data: JSON.stringify(sheet),
    });
    const log = await this.appendLog(roomId, [`Лист «${name}» заведён`]);
    return { roomId, sheets: [sheet], log };
  }

  private async runSetBelonging(
    userId: string, roomId: string, sheetId: string,
    list: 'has' | 'effects', id: string, on: boolean, off?: boolean,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertNotWaiting(roomId, await this.sheetsOf(roomId));
    await this.assertMaySheet(roomId, userId, sheetId);

    const { system, compendium } = this.worldOf(room);

    const record = list === 'has' ? findRecord(compendium, id) : undefined;
    if (list === 'has' && !record) throw new BadRequestException(`в компендиуме нет записи «${id}»`);
    const effect = list === 'effects' ? findEffect(system, id) : null;
    if (list === 'effects') {
      if (!effect) throw new BadRequestException(`система не объявляет эффекта «${id}»`);
      if (on && (effect.activation ?? 'manual') === 'manual') {
        throw new BadRequestException('активируемый эффект не вешают — его применяют действием');
      }
    }

    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
    const sheet = JSON.parse(row.data) as Sheet;

    const next: Sheet = { ...sheet };
    if (list === 'effects') {
      const worn = [...(sheet.effects ?? [])].filter(e => e.effectId !== id);
      if (on) {

        const max = usesMax(effect!);
        const clock = await this.clockOf(roomId);
        worn.push({
          effectId: id,
          ...expiryOf(effect!, clock),
          ...(max === null ? {} : { usesLeft: max }),
        });
      }
      next.effects = worn;
    } else {
      const list = sheet.has ?? [];
      const was = list.find(entry => entry.of === id);
      const entry = { ...(was ?? { of: id }) };
      if (off) entry.off = true; else delete entry.off;
      next.has = !on ? list.filter(other => other.of !== id)
        : was ? list.map(other => (other.of === id ? entry : other)) : [...list, entry];
    }

    const before = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => (entry.sheetId === sheetId ? sheet : JSON.parse(entry.data) as Sheet));
    this.assertWithinLimits(system, compendium, sheet, next, before);

    await this.db.update(roomSheets).set({ data: JSON.stringify(next) })
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const all = before.map(entry => (entry.id === sheetId ? next : entry));
    const lines: string[] = [];
    const world = { system, compendium, die: this.roll, clock: await this.clockOf(roomId) };
    let settled: Sheet[];
    try {
      settled = this.settle(world, before, all, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const touched = await this.persistSheets(roomId, before, settled, [next]);
    const log = lines.length ? await this.appendLog(roomId, lines) : [];
    return { roomId, sheets: touched, log };
  }

  private assertWithinLimits(system: System, compendium: Compendium, sheet: Sheet, next: Sheet, all: Sheet[]): void {
    const options = { compendium, shared: sharedOf(system, all) };
    const broken = newBreaches(system, sheet, next, options);
    if (broken.length) throw new BadRequestException(`так нельзя: ${broken.map(one => one.text).join('; ')}`);
  }

  private settle(
    world: { system: System; compendium: Compendium; die: (sides: number) => number; clock?: ClockState | null },
    before: Sheet[], after: Sheet[], lines: string[],
  ): Sheet[] {
    const done = settleSheets(before, after, world);
    for (const entry of done.aftermath) {
      if (entry.kind === 'fired') { lines.push(describeMoment(world, entry, done.sheets)); continue; }
      const who = done.sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
      lines.push(`«${effectLabelOf(world.system, entry.effectId)}» спало с ${who}: держать стало нечем`);
    }
    return done.sheets;
  }

  private readonly queues = new Map<string, Promise<unknown>>();

  private inTurn<T>(roomId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(roomId, next);
    next.finally(() => { if (this.queues.get(roomId) === next) this.queues.delete(roomId); }).catch(() => undefined);
    return next;
  }

  async listFor(userId: string): Promise<RoomSummary[]> {
    const all = await this.db.select().from(rooms).orderBy(desc(rooms.createdAt));
    const seats = await this.db.select().from(members);
    const mine = new Set(seats.filter(m => m.userId === userId).map(m => m.roomId));
    return all
      .map(room => ({
        id: room.id, title: room.title, worldId: room.worldId,
        memberCount: seats.filter(m => m.roomId === room.id).length,
      }))
      .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));
  }

  private async requireRoom(roomId: string) {
    const found = await this.db.select().from(rooms).where(eq(rooms.id, roomId));
    const room = found[0];
    if (!room) throw new NotFoundException(`комнаты «${roomId}» нет`);
    return room;
  }

  private async runClaimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    await this.requireRoom(roomId);
    const me = await this.memberOf(roomId, userId);
    if (!me) throw new ForbiddenException('вы не в этой комнате');

    if (sheetId) {
      const rows = await this.db.select().from(roomSheets)
        .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
      if (!rows[0]) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
      if (isDesk(JSON.parse(rows[0].data) as Sheet)) {
        throw new BadRequestException('стол общий — за ним не играют, его правит ведущий');
      }

      const taken = (await this.db.select().from(members).where(eq(members.roomId, roomId)))
        .find(row => row.sheetId === sheetId && row.userId !== userId);
      if (taken) throw new BadRequestException('этим листом уже играет кто-то другой');
    }

    await this.db.update(members).set({ sheetId })
      .where(and(eq(members.roomId, roomId), eq(members.userId, userId)));
    return { roomId, sheets: [], log: [] };
  }

  private async assertMaySheet(roomId: string, userId: string, sheetId: string): Promise<void> {
    const me = await this.memberOf(roomId, userId);
    if (!me) throw new ForbiddenException('вы не в этой комнате');
    if (me.role === 'gm') return;
    if (me.sheetId) {
      if (me.sheetId === sheetId) return;
      throw new ForbiddenException('это чужой лист — правит его владелец или ведущий');
    }
    const others = (await this.db.select().from(members).where(eq(members.roomId, roomId)))
      .filter(row => row.userId !== userId);
    if (others.some(row => row.sheetId === sheetId)) {
      throw new ForbiddenException('это чужой лист — правит его владелец или ведущий');
    }
  }

  private async memberOf(roomId: string, userId: string) {
    const found = await this.db.select().from(members)
      .where(and(eq(members.roomId, roomId), eq(members.userId, userId)));
    return found[0] ?? null;
  }

  private async log(roomId: string) {
    const rows = await this.db.select().from(logEntries)
      .where(eq(logEntries.roomId, roomId)).orderBy(asc(logEntries.seq));
    return rows.map(r => ({ id: r.id, at: r.at, text: r.text, ...(r.hidden ? { hidden: true } : {}) }));
  }

  private async appendLog(roomId: string, lines: string[], hidden = false) {
    const existing = await this.db.select().from(logEntries).where(eq(logEntries.roomId, roomId));
    let seq = existing.length;
    const added: { id: string; at: string; text: string; hidden?: boolean }[] = [];

    for (const text of lines) {
      const entry = { id: this.newId(), roomId, at: this.now(), text, seq: seq++, hidden: hidden ? 1 : 0 };
      await this.db.insert(logEntries).values(entry);
      added.push({ id: entry.id, at: entry.at, text: entry.text, ...(hidden ? { hidden: true } : {}) });
    }
    return added;
  }

  async isGm(roomId: string, userId: string): Promise<boolean> {
    const rows = await this.db.select().from(members).where(and(eq(members.roomId, roomId), eq(members.userId, userId)));
    return rows[0]?.role === 'gm';
  }

  private async assertMayHide(roomId: string, userId: string): Promise<void> {
    if (!await this.isGm(roomId, userId)) throw new ForbiddenException('втайне бросает только ведущий');
  }

}

