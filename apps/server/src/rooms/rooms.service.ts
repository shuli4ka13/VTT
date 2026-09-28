import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { and, eq, asc, desc } from 'drizzle-orm';
import { DB, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { rooms, roomSheets, roomClocks, roomPending, members, logEntries, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { world as W } from '@vtt/schema';
import type {
  RoomState, RoomSummary, RoomDelta, ActIntent, TurnIntent, AnswerIntent, ClockState, PendingState,
  Sheet, System, Compendium, StoredValue,
} from '@vtt/schema';
import { deliver, sharedHolderOf } from '@vtt/engine/events/exchange';
import type { Seen } from '@vtt/engine/events/exchange';
import type { EmittedEvent } from '@vtt/engine/engine/rule';
import { previewLines, describeEntry } from '@vtt/engine/events/describe';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { findRecord, sheetKindOf } from '@vtt/engine/model/owned';
import { effectLabelOf, send, receive, offers, react, senderResults } from '@vtt/engine/events/envelope';
import { tapeDie, replayDie } from '@vtt/engine/engine/dice';
import type { Envelope, Offer, ReactionWindow, Report } from '@vtt/engine/events/envelope';
import { findEffect, usesMax } from '@vtt/engine/engine/effects';
import { asksOf, checkInputs, normalizeInputs } from '@vtt/engine/model/asks';
import { fireMoments, describeMoment, momentsOfTurn } from '@vtt/engine/events/moments';
import { releaseHolder } from '@vtt/engine/events/bonds';
import { settle as settleSheets } from '@vtt/engine/events/settle';
import { runSelfTrack, selfRefusal } from '@vtt/engine/events/self';
import { deskOf } from '@vtt/engine/events/desk';
import { DESK_ID, isDesk } from '@vtt/engine/engine/owners';
import { rollCheck, fieldCheck } from '@vtt/engine/engine/check';
import {
  idleClock, startCombat, stopCombat, nextTurn, rollInitiative, expiryOf, inCombat,
} from '@vtt/engine/engine/clock';

export type Role = 'gm' | 'player';

interface PendingRecord {
  id?: string;
  roomId: string;
  intent: ActIntent;
  envelope: Envelope;
  clock: ClockState;
  stage: ReactionWindow | 'deliver';
  claims: string[];
  results: Record<string, unknown>;
  sheetId?: string;
  offered?: Offer[];
  preview?: string[];
  tape?: number[];

  at?: number;
  tapes?: Record<string, number[]>;
  targetClaims?: Record<string, string[]>;

  emitted?: EmittedEvent[];
  afterAt?: number;
  afterSeen?: Record<string, Seen>;
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
    const deskFields = world.system.fields.filter(field => field.desk);
    const withDesk = deskFields.length && !deskOf(world.sheets)
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
    return this.inTurn(intent.roomId, () => this.runTurn(userId, intent));
  }

  act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    return this.inTurn(intent.roomId, () => this.runAct(userId, intent));
  }

  answer(userId: string, intent: AnswerIntent): Promise<RoomDelta> {
    return this.inTurn(intent.roomId, () => this.runAnswer(userId, intent));
  }

  setValue(userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runSetValue(userId, roomId, sheetId, tag, value));
  }

  rollField(userId: string, roomId: string, sheetId: string, tag: string): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runRollField(userId, roomId, sheetId, tag));
  }

  createSheet(userId: string, roomId: string, name: string, of?: string): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runCreateSheet(userId, roomId, name, of));
  }

  setBelonging(
    userId: string, roomId: string, sheetId: string,
    list: 'has' | 'effects', id: string, on: boolean, off?: boolean,
  ): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runSetBelonging(userId, roomId, sheetId, list, id, on, off));
  }

  setSheetKind(userId: string, roomId: string, sheetId: string, of: string | null): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runSetSheetKind(userId, roomId, sheetId, of));
  }

  claimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    return this.inTurn(roomId, () => this.runClaimSheet(userId, roomId, sheetId));
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
          const rolled = rollInitiative(system, sheets, compendium, this.die);
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
      const world = { system, compendium, die: this.die, clock: next };
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

    const { system, compendium } = this.worldOf(room);
    const rows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, intent.roomId));
    const sheets = rows.map(r => JSON.parse(r.data) as Sheet);
    await this.assertMaySheet(intent.roomId, userId, intent.fromId);

    const waiting = await this.pendingOf(intent.roomId);
    if (waiting) {
      const who = sheets.find(s => s.id === waiting.sheetId)?.name ?? waiting.sheetId;
      throw new BadRequestException(`стол ждёт ответа: ${who} решает, применить ли реакцию`);
    }

    const clock = await this.clockOf(intent.roomId);
    let envelope: Envelope;
    let own: { sheet: Sheet; report: Report | null; desk?: Sheet } | null = null;
    try {
      const from = sheets.find(s => s.id === intent.fromId);
      const to = sheets.find(s => s.id === intent.toId);
      if (!from) throw new NotFoundException(`в комнате нет листа «${intent.fromId}»`);
      if (!to) throw new NotFoundException(`в комнате нет листа «${intent.toId}»`);
      const asked = asksOf(intent.actionId, { system, compendium });
      const trouble = checkInputs(asked, intent.inputs, system);
      if (trouble) throw new BadRequestException(trouble);
      const inputs = normalizeInputs(asked, intent.inputs);
      envelope = send(intent.actionId, {
        system, compendium, die: this.die, clock, sheet: from, against: to, claims: intent.edits ?? [], desk: deskOf(sheets),
        ...(Object.keys(inputs).length ? { inputs } : {}),
      });
      own = runSelfTrack(intent.actionId, from, {
        system, compendium, die: this.die, clock, desk: deskOf(sheets),
        ...(Object.keys(inputs).length ? { inputs } : {}),
      });
      const refused = selfRefusal(own, { system }, envelope.label);
      if (refused) throw new BadRequestException(refused);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
    const afterOwn = own?.report
      ? sheets.map(s => (s.id === own!.sheet.id ? own!.sheet : own!.desk && s.id === own!.desk.id ? own!.desk : s))
      : sheets;
    const shared = sharedHolderOf(system, envelope.effect);
    const released = shared ? releaseHolder(system, afterOwn, intent.fromId, shared) : { sheets: afterOwn, broken: [] };
    const started = released.sheets;
    const releasedLines = released.broken.map(broken => {
      const who = started.find(s => s.id === broken.sheetId)?.name ?? broken.sheetId;
      return `«${effectLabelOf(system, broken.effectId)}» спало с ${who}: наложивший взялся за новое`;
    });
    const ownTold = own?.report
      && (own.report.changes.length || own.report.effects.length || own.report.removed.length);
    const ownLines = ownTold
      ? [describeEntry({ fromId: intent.fromId, toId: intent.fromId, report: own!.report }, system, started)]
      : [];

    return this.proceed({
      roomId: intent.roomId, intent, envelope, clock, stage: 'sender',
      claims: intent.edits ?? [], results: {},
    }, {
      system, compendium, sheets: started, log: [...ownLines, ...releasedLines],
      touched: started.filter((sheet, at) => sheet !== sheets[at]),
      origin: sheets,
    });
  }

  private async proceed(
    state: PendingRecord,
    world: {
      system: System; compendium: Compendium; sheets: Sheet[]; log: string[]; touched: Sheet[];
      origin?: Sheet[];
    },
  ): Promise<RoomDelta> {
    const { system, compendium } = world;
    let { sheets } = world;
    const { intent } = state;
    const ctx = { system, compendium, die: this.die, clock: state.clock };
    const sheetOf = (id: string) => {
      const found = sheets.find(s => s.id === id);
      if (!found) throw new NotFoundException(`в комнате нет листа «${id}»`);
      return found;
    };

    let stage: ReactionWindow | 'deliver' = state.stage;
    const targets = targetsOf(intent);
    const takenByTarget = state.targetClaims ?? {};
    const claimsFor = (id: string): string[] =>
      [...new Set([...(intent.targetEdits ?? []), ...(takenByTarget[id] ?? [])])];
    const tapes: Record<string, number[]> = { ...(state.tapes ?? {}) };
    try {
      if (stage === 'sender') {
        const sender = sheetOf(intent.fromId);
        const seen = senderResults(state.envelope);
        const offered = offers(state.envelope, 'sender', { ...ctx, sheet: sender }, seen);
        if (offered.length) {
          return this.park({ ...state, stage: 'sender', sheetId: sender.id, offered, results: seen },
            sender, previewLines(state.envelope, system, null), world);
        }
        stage = 'target';
      }
      if (stage === 'target') {
        for (let at = state.at ?? 0; at < targets.length; at++) {
          const target = sheetOf(targets[at]!);
          const taped = tapeDie(this.die);
          const dry = receive(state.envelope, {
            ...ctx, die: taped.die, sheet: target, claims: claimsFor(target.id), desk: deskOf(sheets),
          });
          const results = dry.results;
          tapes[target.id] = taped.tape;
          const offered = offers(state.envelope, 'target', { ...ctx, sheet: target }, results, dry.report.emitted);
          if (offered.length) {
            return this.park({ ...state, stage: 'target', sheetId: target.id, offered, results, emitted: dry.report.emitted, tapes, at },
              target, previewLines(state.envelope, system, dry), world);
          }
        }
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }

    const lines: string[] = [];
    const afterSeen: Record<string, Seen> = { ...(state.afterSeen ?? {}) };
    if (stage !== 'after') {
      const reports: { fromId: string; toId: string; report: any }[] = [];
      try {
        for (const toId of targets) {
          const out = deliver({
            ...ctx, die: replayDie(tapes[toId] ?? [], this.die), sheets, envelope: state.envelope,
            fromId: intent.fromId, toId,
            claims: { target: claimsFor(toId) },
          });
          sheets = out.sheets;
          reports.push(...out.reports);
          Object.assign(afterSeen, out.seen ?? {});
        }
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      lines.push(...reports.map(entry => describeEntry(entry, system, sheets)));
    }

    try {
      sheets = this.settle(ctx, world.origin ?? world.sheets, sheets, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const touched = await this.persistSheets(state.roomId, world.sheets, sheets, world.touched);
    const log = await this.appendLog(state.roomId, [...world.log, ...lines]);

    for (let at = state.afterAt ?? 0; at < targets.length; at++) {
      const target = sheets.find(s => s.id === targets[at]);
      const seen = afterSeen[targets[at]!];
      if (!target || !seen) continue;
      let offered: Offer[];
      try {
        offered = offers(state.envelope, 'after', { ...ctx, sheet: target }, seen.results, seen.emitted);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      if (!offered.length) continue;
      const parked = await this.park({
        ...state, stage: 'after', sheetId: target.id, offered, tapes, afterAt: at, afterSeen,
        results: seen.results, emitted: seen.emitted,
      }, target, [], { system, sheets, log: [], touched: [] });
      return { ...parked, sheets: touched, log: [...log, ...parked.log] };
    }

    await this.db.delete(roomPending).where(eq(roomPending.roomId, state.roomId));
    return { roomId: state.roomId, sheets: touched, log, clock: state.clock, pending: null };
  }

  private async park(
    state: PendingRecord & { sheetId: string; offered: Offer[] },
    asked: Sheet, preview: string[],
    world: { system: System; sheets: Sheet[]; log: string[]; touched: Sheet[] },
  ): Promise<RoomDelta> {
    const id = this.newId();
    const record: PendingRecord = { ...state, id, preview };
    await this.db.delete(roomPending).where(eq(roomPending.roomId, state.roomId));
    await this.db.insert(roomPending).values({ id, roomId: state.roomId, data: JSON.stringify(record) });
    const pending = this.pendingView(record, asked);
    const touched = await this.persistSheets(state.roomId, world.sheets, world.sheets, world.touched);
    const log = await this.appendLog(state.roomId, [
      ...world.log,
      `${asked.name}: стол ждёт решения — ${pending.options.map(o => o.label).join(', ')}`,
    ]);
    return { roomId: state.roomId, sheets: touched, log, clock: state.clock, pending };
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
    const { system, compendium } = this.worldOf(room);
    const rows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, intent.roomId));
    let sheets = rows.map(r => JSON.parse(r.data) as Sheet);
    const origin = sheets;
    const asked = sheets.find(s => s.id === record.sheetId);
    if (!asked) throw new NotFoundException(`в комнате нет листа «${record.sheetId}»`);
    await this.assertMaySheet(intent.roomId, userId, asked.id);

    const clock = record.clock;
    const lines: string[] = [];
    let envelope = record.envelope;
    let claims = record.claims;
    let targetClaims = record.targetClaims ?? {};
    const tapes = { ...(record.tapes ?? {}) };
    const changed: Sheet[] = [];
    try {
      const reacted = react(intent.chosen, envelope, record.stage as ReactionWindow,
        { system, compendium, die: this.die, clock, sheet: asked }, record.results, record.emitted ?? []);
      sheets = sheets.map(s => (s.id === asked.id ? reacted.sheet : s));
      if (reacted.sheet !== asked) changed.push(reacted.sheet);
      for (const report of reacted.reports) {
        lines.push(describeEntry({ fromId: asked.id, toId: asked.id, report }, system, sheets));
      }
      for (const reply of reacted.replies) {
        const target = sheets.find(s => s.id === reply.to);
        if (!target) continue;
        const back = receive(reply, { system, compendium, die: this.die, clock, sheet: target, desk: deskOf(sheets) });
        sheets = sheets.map(s => (s.id === back.sheet.id ? back.sheet : back.desk && s.id === back.desk.id ? back.desk : s));
        if (back.sheet !== target) changed.push(back.sheet);
        if (back.desk) changed.push(back.desk);
        lines.push(describeEntry({ fromId: asked.id, toId: target.id, report: back.report }, system, sheets));
      }
      if (!intent.chosen.length) lines.push(`${asked.name} пропускает реакцию`);

      if (record.stage === 'target' && reacted.claims.length) {
        targetClaims = {
          ...targetClaims,
          [asked.id]: [...new Set([...(targetClaims[asked.id] ?? []), ...reacted.claims])],
        };
        delete tapes[asked.id];
        lines.push(`${asked.name}: бросок пересчитан с заявленной правкой`);
      }

      if (record.stage === 'sender' && reacted.claims.length) {
        claims = [...new Set([...claims, ...reacted.claims])];
        const from = sheets.find(s => s.id === record.intent.fromId)!;
        const to = sheets.find(s => s.id === targetsOf(record.intent)[0])!;
        const asked = asksOf(record.intent.actionId, { system, compendium });
        const inputs = normalizeInputs(asked, record.intent.inputs);
        envelope = send(record.intent.actionId, {
          system, compendium, die: this.die, clock, sheet: from, against: to, claims, desk: deskOf(sheets),
          ...(Object.keys(inputs).length ? { inputs } : {}),
          kept: envelope.steps,
        });
        lines.push(`${from.name}: бросок собран заново — выпавшее остаётся, новые кости добавлены`);
      }
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const more = record.stage === 'target' && (record.at ?? 0) + 1 < targetsOf(record.intent).length;
    return this.proceed({
      ...record, envelope, clock, claims, targetClaims, tapes,
      stage: record.stage === 'sender' || more ? 'target' : record.stage === 'after' ? 'after' : 'deliver',
      ...(record.stage === 'target' ? { at: (record.at ?? 0) + 1 } : {}),
      ...(record.stage === 'after' ? { afterAt: (record.afterAt ?? 0) + 1 } : {}),
      results: {},
    }, { system, compendium, sheets, log: lines, touched: changed, origin });
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
    return row ? JSON.parse(row.data) as PendingRecord : null;
  }

  private async pendingOf(roomId: string): Promise<PendingState | null> {
    const record = await this.pendingRecord(roomId);
    if (!record?.sheetId) return null;
    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, record.sheetId)));
    const asked = rows[0] ? JSON.parse(rows[0].data) as Sheet : null;
    return asked ? this.pendingView(record, asked) : null;
  }

  private pendingView(record: PendingRecord, asked: Sheet): PendingState {
    const stage = record.stage as ReactionWindow;
    return {
      id: String(record.id),
      sheetId: asked.id,
      stage,
      question: stage === 'sender'
        ? `${asked.name}: бросок сделан — ответить реакцией?`
        : stage === 'after'
          ? `${asked.name}: на вас подействовали — ответить реакцией?`
          : `${asked.name}: на вас действуют — ответить реакцией?`,
      options: (record.offered ?? []).map(o => ({ id: o.id, label: o.label })),
      preview: record.preview ?? [],
    };
  }

  private async runSetValue(
    userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertMaySheet(roomId, userId, sheetId);

    const { system } = this.worldOf(room);
    const field = system.fields.find(f => f.tag === tag);
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
    const lines: string[] = [];
    let settled = before.map(entry => (entry.id === sheetId ? next : entry));
    try {
      const world = { system, compendium: this.worldOf(room).compendium, die: this.die, clock: await this.clockOf(roomId) };
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
    await this.assertMaySheet(roomId, userId, sheetId);
    const { system, compendium } = this.worldOf(room);
    if (of !== null && system.records?.[of]?.kind !== 'sheet') {
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
      const world = { system, compendium, die: this.die, clock: await this.clockOf(roomId) };
      settled = this.settle(world, before, settled, lines);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const touched = await this.persistSheets(roomId, before, settled, [next]);
    const log = lines.length ? await this.appendLog(roomId, lines) : [];
    return { roomId, sheets: touched, log };
  }

  private async runRollField(userId: string, roomId: string, sheetId: string, tag: string): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
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

    let line: string;
    try {
      const { rolled, bonus, total, edits } = rollCheck(system, sheet, check, { compendium, die: this.die, owner: check.label });
      const named = edits.length ? ` (${edits.join(', ')})` : '';
      const shown = rolled.kept != null && rolled.rolls.length > 1
        ? `[${rolled.rolls.join(', ')}] → ${rolled.kept}` : `[${rolled.rolls.join(', ')}]`;
      line = `${sheet.name} бросает «${check.label}»: ${shown}${named} + ${bonus} = ${total}`;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const log = await this.appendLog(roomId, [line]);
    return { roomId, sheets: [], log };
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

    await this.db.update(roomSheets).set({ data: JSON.stringify(next) })
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));

    const before = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => (entry.sheetId === sheetId ? sheet : JSON.parse(entry.data) as Sheet));
    const all = before.map(entry => (entry.id === sheetId ? next : entry));
    const lines: string[] = [];
    const world = { system, compendium, die: this.die, clock: await this.clockOf(roomId) };
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
    return rows.map(r => ({ id: r.id, at: r.at, text: r.text }));
  }

  private async appendLog(roomId: string, lines: string[]) {
    const existing = await this.db.select().from(logEntries).where(eq(logEntries.roomId, roomId));
    let seq = existing.length;
    const added: { id: string; at: string; text: string }[] = [];

    for (const text of lines) {
      const entry = { id: this.newId(), roomId, at: this.now(), text, seq: seq++ };
      await this.db.insert(logEntries).values(entry);
      added.push({ id: entry.id, at: entry.at, text: entry.text });
    }
    return added;
  }

}

