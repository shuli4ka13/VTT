import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { DB, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { rooms, roomSheets, roomClocks, roomPending, members, logEntries, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { world as W } from '@vtt/schema';
import type {
  RoomState, RoomSummary, RoomDelta, ActIntent, TurnIntent, AnswerIntent, ClockState, PendingState,
  Sheet, System, Compendium, StoredValue,
} from '@vtt/schema';
import { deliver } from '@vtt/engine/events/exchange';
import { previewLines, describeEntry } from '@vtt/engine/events/describe';
import { unifyWorld } from '@vtt/engine/model/unify';
import { effectLabelOf, actionOf, send, receive, offers, react, senderResults } from '@vtt/engine/events/envelope';
import { tapeDie, replayDie } from '@vtt/engine/engine/dice';
import type { Envelope, Offer, ReactionWindow } from '@vtt/engine/events/envelope';
import { findEffect, usesMax } from '@vtt/engine/engine/effects';
import { asksOf, checkInputs, normalizeInputs } from '@vtt/engine/model/asks';
import { fireMoments, describeMoment } from '@vtt/engine/events/moments';
import { sweepBonds } from '@vtt/engine/events/bonds';
import type { MomentEvent } from '@vtt/engine/events/moments';
import { resolveRoll } from '@vtt/engine/engine/modifiers';
import { newPass, calc } from '@vtt/engine/engine/calc';
import { rollLead, dieConstant } from '@vtt/engine/engine/lead-die';
import {
  idleClock, startCombat, stopCombat, nextTurn, endScene, spendAction, rollInitiative, expiryOf,
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
    const world = unifyWorld({
      system: JSON.parse(room.system) as System,
      compendium: JSON.parse(room.compendium) as Compendium,
    });
    return { system: world.system, compendium: world.compendium as Compendium };
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
    for (const sheet of world.sheets) {
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

    const people: { userId: string; name: string }[] = [];
    for (const m of memberRows) {
      const found = await this.db.select().from(users).where(eq(users.id, m.userId));
      people.push({ userId: m.userId, name: found[0]?.name ?? 'неизвестен' });
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

  async turn(userId: string, intent: TurnIntent): Promise<RoomDelta> {
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
    const tell = (expired: { sheetId: string; effectId: string }[]) => {
      for (const e of expired) lines.push(`«${effectLabelOf(system, e.effectId)}» спало с ${nameOf(e.sheetId)}`);
    };

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
        const tick = nextTurn(clock, sheets);
        next = tick.clock;
        after = tick.sheets;
        tell(tick.expired);
        lines.push(next.round !== clock.round
          ? `Раунд ${next.round}. Ход: ${nameOf(String(next.active))}`
          : `Ход: ${nameOf(String(next.active))}`);
      } else if (intent.op === 'stop') {
        next = stopCombat();
        lines.push('Бой окончен');
      } else {
        const closed = endScene(sheets);
        after = closed.sheets;
        tell(closed.expired);
        lines.push('Сцена закрыта');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException((err as Error).message);
    }

    try {
      const world = { system, compendium, die: this.die, clock: next };
      const fired = fireMoments(momentsOf(intent.op, clock, next, after), after, world);
      after = fired.sheets;
      for (const entry of fired.reports) lines.push(describeMoment(world, entry, after));

      const swept = sweepBonds(system, after);
      after = swept.sheets;
      for (const broken of swept.broken) {
        const who = after.find(s => s.id === broken.sheetId)?.name ?? broken.sheetId;
        lines.push(`«${effectLabelOf(system, broken.effectId)}» спало с ${who}: держать стало нечем`);
      }
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

  async act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    const room = await this.requireRoom(intent.roomId);
    if (!await this.memberOf(intent.roomId, userId)) {
      throw new ForbiddenException('вы не в этой комнате');
    }

    const { system, compendium } = this.worldOf(room);
    const rows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, intent.roomId));
    const sheets = rows.map(r => JSON.parse(r.data) as Sheet);

    const waiting = await this.pendingOf(intent.roomId);
    if (waiting) {
      const who = sheets.find(s => s.id === waiting.sheetId)?.name ?? waiting.sheetId;
      throw new BadRequestException(`стол ждёт ответа: ${who} решает, применить ли реакцию`);
    }

    const clock = await this.clockOf(intent.roomId);
    let nextClock: ClockState = clock;
    let envelope: Envelope;
    try {
      const action = actionOf(intent.actionId, { system, compendium });
      const effect = findEffect(system, action.effect);
      if (effect) nextClock = spendAction(system, clock, intent.fromId, effect);
      const from = sheets.find(s => s.id === intent.fromId);
      const to = sheets.find(s => s.id === intent.toId);
      if (!from) throw new NotFoundException(`в комнате нет листа «${intent.fromId}»`);
      if (!to) throw new NotFoundException(`в комнате нет листа «${intent.toId}»`);
      const asked = asksOf(intent.actionId, { system, compendium });
      const trouble = checkInputs(asked, intent.inputs);
      if (trouble) throw new BadRequestException(trouble);
      const inputs = normalizeInputs(asked, intent.inputs);
      envelope = send(intent.actionId, {
        system, compendium, die: this.die, clock: nextClock, sheet: from, against: to, claims: intent.edits ?? [],
        ...(Object.keys(inputs).length ? { inputs } : {}),
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
    return this.proceed({
      roomId: intent.roomId, intent, envelope, clock: nextClock, stage: 'sender',
      claims: intent.edits ?? [], results: {},
    }, { system, compendium, sheets, log: [], touched: [], clockDirty: nextClock !== clock });
  }

  private async proceed(
    state: PendingRecord,
    world: {
      system: System; compendium: Compendium; sheets: Sheet[]; log: string[]; touched: Sheet[];
      clockDirty: boolean;
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
          const dry = receive(state.envelope, { ...ctx, die: taped.die, sheet: target, claims: intent.targetEdits ?? [] });
          const results = dry.results;
          tapes[target.id] = taped.tape;
          const offered = offers(state.envelope, 'target', { ...ctx, sheet: target }, results);
          if (offered.length) {
            return this.park({ ...state, stage: 'target', sheetId: target.id, offered, results, tapes, at },
              target, previewLines(state.envelope, system, dry), world);
          }
        }
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }

    const reports: { fromId: string; toId: string; report: any }[] = [];
    try {
      for (const toId of targets) {
        const out = deliver({
          ...ctx, die: replayDie(tapes[toId] ?? [], this.die), sheets, envelope: state.envelope,
          fromId: intent.fromId, toId,
          claims: { target: intent.targetEdits ?? [] },
        });
        sheets = out.sheets;
        reports.push(...out.reports);
      }
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const lines = reports.map(entry => describeEntry(entry, system, sheets));
    const swept = sweepBonds(system, sheets);
    sheets = swept.sheets;
    for (const broken of swept.broken) {
      const who = sheets.find(s => s.id === broken.sheetId)?.name ?? broken.sheetId;
      lines.push(`«${effectLabelOf(system, broken.effectId)}» спало с ${who}: держать стало нечем`);
    }

    if (world.clockDirty) await this.saveClock(state.roomId, state.clock);
    const touched = await this.persistSheets(state.roomId, world.sheets, sheets, world.touched);
    const log = await this.appendLog(state.roomId, [...world.log, ...lines]);
    await this.db.delete(roomPending).where(eq(roomPending.roomId, state.roomId));

    return { roomId: state.roomId, sheets: touched, log, clock: state.clock, pending: null };
  }

  private async park(
    state: PendingRecord & { sheetId: string; offered: Offer[] },
    asked: Sheet, preview: string[],
    world: { system: System; sheets: Sheet[]; log: string[]; touched: Sheet[]; clockDirty: boolean },
  ): Promise<RoomDelta> {
    const id = this.newId();
    const record: PendingRecord = { ...state, id, preview };
    if (world.clockDirty) await this.saveClock(state.roomId, state.clock);
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

  async answer(userId: string, intent: AnswerIntent): Promise<RoomDelta> {
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
    const asked = sheets.find(s => s.id === record.sheetId);
    if (!asked) throw new NotFoundException(`в комнате нет листа «${record.sheetId}»`);

    let clock = record.clock;
    const lines: string[] = [];
    let envelope = record.envelope;
    let claims = record.claims;
    let changed: Sheet[] = [];
    try {
      const reacted = react(intent.chosen, envelope, record.stage as ReactionWindow,
        { system, compendium, die: this.die, clock, sheet: asked }, record.results);
      for (const id of intent.chosen) {
        const effect = findEffect(system, id);
        if (effect) clock = spendAction(system, clock, asked.id, effect);
      }
      sheets = sheets.map(s => (s.id === asked.id ? reacted.sheet : s));
      if (reacted.sheet !== asked) changed = [reacted.sheet];
      for (const report of reacted.reports) {
        lines.push(describeEntry({ fromId: asked.id, toId: asked.id, report }, system, sheets));
      }
      if (!intent.chosen.length) lines.push(`${asked.name} пропускает реакцию`);

      if (record.stage === 'sender' && reacted.claims.length) {
        claims = [...new Set([...claims, ...reacted.claims])];
        const from = sheets.find(s => s.id === record.intent.fromId)!;
        const to = sheets.find(s => s.id === record.intent.toId)!;
        envelope = send(record.intent.actionId, {
          system, compendium, die: this.die, clock, sheet: from, against: to, claims,
        });
        lines.push(`${from.name}: бросок собран заново`);
      }
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const more = record.stage === 'target' && (record.at ?? 0) + 1 < targetsOf(record.intent).length;
    return this.proceed({
      ...record, envelope, clock, claims,
      stage: record.stage === 'sender' || more ? 'target' : 'deliver',
      ...(record.stage === 'target' ? { at: (record.at ?? 0) + 1 } : {}),
      results: {},
    }, { system, compendium, sheets, log: lines, touched: changed, clockDirty: clock !== record.clock });
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
        : `${asked.name}: на вас действуют — ответить реакцией?`,
      options: (record.offered ?? []).map(o => ({ id: o.id, label: o.label })),
      preview: record.preview ?? [],
    };
  }

  async setValue(
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
    await this.db.update(roomSheets).set({ data: JSON.stringify(next) })
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));

    return { roomId, sheets: [next], log: [] };
  }

  async rollField(userId: string, roomId: string, sheetId: string, tag: string): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    await this.assertMaySheet(roomId, userId, sheetId);

    const { system, compendium } = this.worldOf(room);
    const field = system.fields.find(f => f.tag === tag);
    if (!field) throw new BadRequestException(`система не объявляет поля «${tag}»`);
    if (!field.roll) throw new BadRequestException(`по полю «${field.label}» не бросают — включите броски в конструкторе`);
    if (!system.initiative?.die?.constant) {
      throw new BadRequestException('в системе не объявлена кость — броски с листа делать нечем');
    }

    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);
    const sheet = JSON.parse(row.data) as Sheet;

    let line: string;
    try {
      const pass = newPass(system, sheet, { compendium });
      const resolution = resolveRoll(system, sheet, null, pass);
      const bonus = Number(calc(system, sheet, tag, pass) ?? 0);
      const rolled = rollLead(dieConstant(system, system.initiative.die.constant), this.die, resolution.edits);
      const total = rolled.total + bonus + resolution.bonus;
      const edits = resolution.edits.length ? ` (${resolution.edits.map(edit => edit.label).join(', ')})` : '';
      const shown = rolled.kept != null && rolled.rolls.length > 1
        ? `[${rolled.rolls.join(', ')}] → ${rolled.kept}` : `[${rolled.rolls.join(', ')}]`;
      line = `${sheet.name} бросает «${field.roll.label ?? field.label}»: ${shown}${edits} + ${bonus + resolution.bonus} = ${total}`;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const log = await this.appendLog(roomId, [line]);
    return { roomId, sheets: [], log };
  }

  async createSheet(
    userId: string, roomId: string, name: string, kind: 'pc' | 'npc' = 'pc',
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const { system } = this.worldOf(room);

    const sheet = W.sheet.parse({
      id: this.newId(),
      systemId: system.id ?? '',
      kind,
      name,
      values: {},
      equipped: [],
      effects: [],
      actions: [],
    });

    await this.db.insert(roomSheets).values({
      roomId, sheetId: sheet.id, data: JSON.stringify(sheet),
    });
    const log = await this.appendLog(roomId, [`Лист «${name}» заведён`]);
    return { roomId, sheets: [sheet], log };
  }

  async setBelonging(
    userId: string, roomId: string, sheetId: string,
    list: 'equipped' | 'actions' | 'effects', id: string, on: boolean,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const { system, compendium } = this.worldOf(room);

    if (list === 'equipped' && !(compendium.items ?? []).some(i => i.id === id)) {
      throw new BadRequestException(`в компендиуме нет предмета «${id}»`);
    }
    if (list === 'actions' && !(compendium.actions ?? []).some(a => a.id === id)) {
      throw new BadRequestException(`в компендиуме нет действия «${id}»`);
    }
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
      const refs = new Set(sheet[list] ?? []);
      if (on) refs.add(id); else refs.delete(id);
      next[list] = [...refs];
    }

    await this.db.update(roomSheets).set({ data: JSON.stringify(next) })
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));

    if (list !== 'effects') return { roomId, sheets: [next], log: [] };

    const all = (await this.db.select().from(roomSheets).where(eq(roomSheets.roomId, roomId)))
      .map(entry => (entry.sheetId === sheetId ? next : JSON.parse(entry.data) as Sheet));
    const swept = sweepBonds(system, all);
    const lines: string[] = [];
    for (const broken of swept.broken) {
      const who = swept.sheets.find(s => s.id === broken.sheetId)?.name ?? broken.sheetId;
      lines.push(`«${effectLabelOf(system, broken.effectId)}» спало с ${who}: держать стало нечем`);
    }
    const touched = await this.persistSheets(roomId, all, swept.sheets, [next]);
    const log = lines.length ? await this.appendLog(roomId, lines) : [];
    return { roomId, sheets: touched, log };
  }

  async listFor(userId: string): Promise<RoomSummary[]> {
    const mine = await this.db.select().from(members).where(eq(members.userId, userId));
    const out: RoomSummary[] = [];
    for (const m of mine) {
      const found = await this.db.select().from(rooms).where(eq(rooms.id, m.roomId));
      const room = found[0];
      if (!room) continue;
      const all = await this.db.select().from(members).where(eq(members.roomId, room.id));
      out.push({ id: room.id, title: room.title, worldId: room.worldId, memberCount: all.length });
    }
    return out;
  }

  private async requireRoom(roomId: string) {
    const found = await this.db.select().from(rooms).where(eq(rooms.id, roomId));
    const room = found[0];
    if (!room) throw new NotFoundException(`комнаты «${roomId}» нет`);
    return room;
  }

  async claimSheet(userId: string, roomId: string, sheetId: string | null): Promise<RoomDelta> {
    await this.requireRoom(roomId);
    const me = await this.memberOf(roomId, userId);
    if (!me) throw new ForbiddenException('вы не в этой комнате');

    if (sheetId) {
      const rows = await this.db.select().from(roomSheets)
        .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
      if (!rows[0]) throw new NotFoundException(`в комнате нет листа «${sheetId}»`);

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

const momentsOf = (
  op: TurnIntent['op'], before: ClockState, after: ClockState, sheets: Sheet[],
): MomentEvent[] => {
  const everyone = (moment: MomentEvent['moment']): MomentEvent[] =>
    sheets.map(sheet => ({ moment, sheetId: sheet.id }));

  if (op === 'start') {
    return [
      ...everyone('combat-start'),
      ...everyone('round-start'),
      ...(after.active ? [{ moment: 'turn-start' as const, sheetId: String(after.active) }] : []),
    ];
  }
  if (op === 'next') {
    const ended = before.active ? [{ moment: 'turn-end' as const, sheetId: String(before.active) }] : [];
    const round = after.round !== before.round ? everyone('round-start') : [];
    const started = after.active ? [{ moment: 'turn-start' as const, sheetId: String(after.active) }] : [];
    return [...ended, ...round, ...started];
  }
  if (op === 'stop') return everyone('combat-end');
  return everyone('scene-end');
};
