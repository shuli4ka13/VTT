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
import { unifyWorld } from '@vtt/engine/model/unify';
import { effectLabelOf, actionOf, send, receive, offers, react } from '@vtt/engine/events/envelope';
import type { Envelope, Offer, ReactionWindow } from '@vtt/engine/events/envelope';
import { findEffect, usesMax } from '@vtt/engine/engine/effects';
import {
  idleClock, startCombat, stopCombat, nextTurn, endScene, spendAction, rollInitiative, expiryOf,
} from '@vtt/engine/engine/clock';
import { breakReasonWord, registry as stepRegistry } from '@vtt/engine/engine/steps/index';

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
}

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
          if (unknown) throw new BadRequestException(`в комнате нет чарника «${unknown}»`);
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
      if (!from) throw new NotFoundException(`в комнате нет чарника «${intent.fromId}»`);
      if (!to) throw new NotFoundException(`в комнате нет чарника «${intent.toId}»`);
      envelope = send(intent.actionId, {
        system, compendium, die: this.die, clock: nextClock, sheet: from, against: to, claims: intent.edits ?? [],
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
    if (nextClock !== clock) await this.saveClock(intent.roomId, nextClock);

    return this.proceed({
      roomId: intent.roomId, intent, envelope, clock: nextClock, stage: 'sender',
      claims: intent.edits ?? [], results: {},
    }, { system, compendium, sheets, log: [], touched: [] });
  }

  private async proceed(
    state: PendingRecord,
    world: { system: System; compendium: Compendium; sheets: Sheet[]; log: string[]; touched: Sheet[] },
  ): Promise<RoomDelta> {
    const { system, compendium } = world;
    let { sheets } = world;
    const { intent } = state;
    const ctx = { system, compendium, die: this.die, clock: state.clock };
    const sheetOf = (id: string) => {
      const found = sheets.find(s => s.id === id);
      if (!found) throw new NotFoundException(`в комнате нет чарника «${id}»`);
      return found;
    };

    let stage: ReactionWindow | 'deliver' = state.stage;
    let results: Record<string, unknown> = state.results;
    try {
      if (stage === 'sender') {
        const sender = sheetOf(intent.fromId);
        const offered = offers(state.envelope, 'sender', { ...ctx, sheet: sender });
        if (offered.length) {
          return this.park({ ...state, stage: 'sender', sheetId: sender.id, offered, results: {} },
            sender, this.preview(state.envelope, system, null), world);
        }
        stage = 'target';
      }
      if (stage === 'target') {
        const target = sheetOf(intent.toId);
        const dry = receive(state.envelope, { ...ctx, sheet: target, claims: intent.targetEdits ?? [] });
        results = dry.results;
        const offered = offers(state.envelope, 'target', { ...ctx, sheet: target }, results);
        if (offered.length) {
          return this.park({ ...state, stage: 'target', sheetId: target.id, offered, results },
            target, this.preview(state.envelope, system, dry), world);
        }
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }

    let result: { sheets: Sheet[]; reports: { fromId: string; toId: string; report: any }[] };
    try {
      result = deliver({
        ...ctx, sheets, envelope: state.envelope, fromId: intent.fromId, toId: intent.toId,
        claims: { target: intent.targetEdits ?? [] },
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    sheets = result.sheets;

    const touched = await this.persistSheets(state.roomId, world.sheets, sheets, world.touched);
    const log = await this.appendLog(state.roomId, [
      ...world.log,
      ...result.reports.map(entry => this.describe(entry, system, sheets)),
    ]);
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
    if (!asked) throw new NotFoundException(`в комнате нет чарника «${record.sheetId}»`);

    let clock = record.clock;
    const lines: string[] = [];
    let envelope = record.envelope;
    let claims = record.claims;
    try {
      const reacted = react(intent.chosen, envelope, record.stage as ReactionWindow,
        { system, compendium, die: this.die, clock, sheet: asked }, record.results);
      for (const id of intent.chosen) {
        const effect = findEffect(system, id);
        if (effect) clock = spendAction(system, clock, asked.id, effect);
      }
      sheets = sheets.map(s => (s.id === asked.id ? reacted.sheet : s));
      for (const report of reacted.reports) {
        lines.push(this.describe({ fromId: asked.id, toId: asked.id, report }, system, sheets));
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
    if (clock !== record.clock) await this.saveClock(intent.roomId, clock);

    const original = rows.map(r => JSON.parse(r.data) as Sheet);
    return this.proceed({
      ...record, envelope, clock, claims,
      stage: record.stage === 'sender' ? 'target' : 'deliver',
      results: {},
    }, { system, compendium, sheets, log: lines, touched: sheets.filter((s, i) => s !== original[i]) });
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

  private preview(envelope: Envelope, system: System, dry: { report: { trace: Record<string, any>[] } } | null): string[] {
    const lines: string[] = [];
    for (const step of envelope.steps as Record<string, any>[]) {
      if (step.type !== 'threshold' || !step.rolled) continue;
      const tag = step.check ?? step.roll?.check;
      const check = system.rolls?.find(r => r.tag === tag)?.label ?? 'Бросок';
      const bonus = typeof step.bonus?.const === 'number' ? step.bonus.const + (step.modBonus ?? 0) : (step.modBonus ?? 0);
      const rolls = step.rolled.kept != null && step.rolled.rolls.length > 1
        ? `[${step.rolled.rolls.join(', ')}] → ${step.rolled.kept}` : `[${step.rolled.rolls.join(', ')}]`;
      lines.push(`${check}: ${rolls}${bonus ? ` + ${bonus}` : ''} = ${step.rolled.total + bonus}`);
    }
    for (const trace of dry?.report.trace ?? []) {
      if (trace.type !== 'threshold' || trace.skipped) continue;
      const versus = trace.versus?.tag
        ? system.fields.find(f => f.tag === trace.versus.tag)?.label ?? trace.versus.tag : 'порог';
      lines.push(`против ${versus} ${trace.versus?.value}: ${trace.success ? 'попадание' : 'промах'}`);
    }
    return lines;
  }

  async setValue(
    userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

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
    if (!row) throw new NotFoundException(`в комнате нет чарника «${sheetId}»`);

    const sheet = JSON.parse(row.data) as Sheet;
    const next: Sheet = { ...sheet, values: { ...sheet.values, [tag]: value } };
    await this.db.update(roomSheets).set({ data: JSON.stringify(next) })
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));

    return { roomId, sheets: [next], log: [] };
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
      if ((effect.activation ?? 'manual') === 'manual') {
        throw new BadRequestException('активируемый эффект не вешают — его применяют действием');
      }
    }

    const rows = await this.db.select().from(roomSheets)
      .where(and(eq(roomSheets.roomId, roomId), eq(roomSheets.sheetId, sheetId)));
    const row = rows[0];
    if (!row) throw new NotFoundException(`в комнате нет чарника «${sheetId}»`);
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
    return { roomId, sheets: [next], log: [] };
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

  private describe(
    entry: { fromId: string; toId: string; report: any },
    system: System, sheets: Sheet[],
  ): string {
    const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
    const label = effectLabelOf(system, entry.report.effect);
    const head = entry.fromId === entry.toId
      ? `${nameOf(entry.fromId)} применяет «${label}»`
      : entry.report.reply
        ? `${nameOf(entry.fromId)} отвечает «${label}» по ${nameOf(entry.toId)}`
        : `${nameOf(entry.fromId)} применяет «${label}» по ${nameOf(entry.toId)}`;

    const changes = (entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[];
    const shown = changes.map(c => {
      const field = system.fields.find(f => f.tag === c.tag);
      return `${field?.label ?? c.tag}: ${c.from} → ${c.to}`;
    });
    const labelOf = (tag: string) =>
      system.fields.find(f => f.tag === tag)?.label
      ?? system.rolls?.find(r => r.tag === tag)?.label
      ?? tag;
    const effect = system.effects[String(entry.report.effect)] as any;
    const stepOf = (trace: Record<string, unknown>) => (effect?.steps ?? [])
      .find((step: any, index: number) => String(step.id ?? index) === String(trace.step));
    const refLabel = (ref: any): string | null => {
      if (!ref || typeof ref !== 'object') return null;
      if ('param' in ref) return effect?.params?.find((p: any) => p.key === ref.param)?.label ?? String(ref.param);
      if ('tag' in ref) return labelOf(String(ref.tag));
      if ('prop' in ref) {
        for (const kind of Object.values(system.records ?? {}) as any[]) {
          const prop = kind.props?.find((p: any) => p.key === ref.prop);
          if (prop) return prop.label ?? String(ref.prop);
        }
        return String(ref.prop);
      }
      if ('constant' in ref) return system.constants?.[String(ref.constant)]?.label ?? String(ref.constant);
      if ('ref' in ref) {
        const [head, ...path] = String(ref.ref).split('.');
        const source = (effect?.steps ?? []).find((step: any) => String(step.id) === head);
        const outputs = (stepRegistry.get(String(source?.type)) as any)?.outputs as
          { path: string; label: string }[] | undefined;
        const found = outputs?.find(o => o.path === (path.length ? `.${path.join('.')}` : ''));
        return found?.label ?? String(ref.ref);
      }
      if ('expr' in ref) {
        const exact = /^#([\p{L}\p{N}_-]+)$/u.exec(String(ref.expr).trim());
        return exact ? labelOf(exact[1]!) : String(ref.expr).replace(
          /#([\p{L}\p{N}_-]+)/gu, (_: string, tag: string) => labelOf(tag));
      }
      return null;
    };
    const namedTrace = (trace: Record<string, any>): string | null => {
      const step = stepOf(trace);
      if (trace.type === 'threshold') {
        const raw: number[] = Array.isArray(trace.raw) ? trace.raw : [];
        const shown = ((trace.rolls ?? []) as number[])
          .map((v, i) => (raw.length === trace.rolls.length && raw[i] !== v ? `${raw[i]}→${v}` : String(v)))
          .join(', ');
        const rolls = trace.kept != null && trace.rolls?.length > 1 ? `[${shown}] → ${trace.kept}` : `[${shown}]`;
        const check = system.rolls?.find(r => r.tag === step?.roll?.check)?.label ?? 'Проверка';
        const edits = trace.edits?.length ? ` (${trace.edits.join(', ')})` : '';
        const bonus = step?.roll?.bonus ? ` + ${refLabel(step.roll.bonus) ?? 'Бонус'}: ${trace.bonus}` : '';
        const versus = trace.versus?.tag ? labelOf(String(trace.versus.tag))
          : (refLabel(step?.versus) ?? 'порог');
        const degree = trace.degree !== undefined && trace.degree !== null ? `, степень ${trace.degree}` : '';
        const verdict = (trace.success ? 'успех' : 'промах') + degree;
        return `${check}: ${rolls}${edits}${bonus} = ${trace.total} против ${versus}: ${trace.versus?.value} — ${verdict}`;
      }
      if (trace.type === 'amount') {
        const terms: string[] = [];
        if (trace.rolls?.length) {
          const value = trace.rolls.reduce((sum: number, die: number) => sum + die, 0);
          terms.push(`${refLabel(step?.dice) ?? 'Бросок'}: ${value}`);
        }
        if (step?.fixed !== undefined) terms.push(`${refLabel(step.fixed) ?? 'Значение'}: ${trace.flat}`);
        if (step?.bonus !== undefined) terms.push(`${refLabel(step.bonus) ?? 'Бонус'}: ${trace.bonus}`);
        if (step?.margin !== undefined) terms.push(`${refLabel(step.margin) ?? 'Запас'}: ${trace.margin}`);
        return `${terms.join(' + ') || '0'} = ${trace.total}`;
      }
      return null;
    };
    const eventLabel = (id: string) => system.events?.[id]?.label ?? id;
    const calculation = (entry.report.trace ?? []).flatMap((trace: Record<string, unknown>) => {
      if (trace.skipped) return [`шаг «${trace.step}» пропущен`];
      const named = trace.within ? null : namedTrace(trace);
      if (named) return [named];
      const line = stepRegistry.get(String(trace.type))?.traceLine;
      if (!line) return [];
      try { return [String((line as any)(trace, { labelOf, eventLabel, effectLabel: (id: string) => effectLabelOf(system, id) }))]; }
      catch { return []; }
    });

    const reactions = (entry.report.reactions ?? []) as {
      label: string; stopped?: { reason?: string } | null; effects?: string[];
    }[];
    const told = reactions
      .filter(r => !r.stopped)
      .map(r => {
        const hung = (r.effects ?? []).map(id => effectLabelOf(system, id)).join(', ');
        return hung ? `${r.label}: ${hung}` : r.label;
      });

    const stopped = entry.report.stopped as { type: string; reason: string } | null;
    const stop = stopped ? breakReasonWord(stopped.type, stopped.reason) : '';

    const tail = [calculation.join(' · '), shown.join(', '), told.join('; '), stop]
      .filter(Boolean).join(' · ');
    if (!tail) return head;
    return `${head} · ${tail}`;
  }
}
