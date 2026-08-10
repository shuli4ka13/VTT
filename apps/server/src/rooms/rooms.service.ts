// Комнаты и ход. Здесь то самое «общение чарников по правилам системы»,
// но АВТОРИТЕТНО: сервер исполняет ТОТ ЖЕ движок, что и браузер, бросает свои
// кости и не верит клиенту ни в одном числе.
//
// Клиент присылает только НАМЕРЕНИЕ: каким действием, от какого листа, по
// какому листу. Всё остальное — расчёт сервера. Именно ради этого движок
// сделан изоморфным: клиенту он рисует значения сразу, серверу — решает исход.

import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { DB, CLOCK, IDS, DIE } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { rooms, roomSheets, members, logEntries, users } from '../db/schema.ts';
import { WorldsService } from '../worlds/worlds.service.ts';
import { world as W } from '@vtt/schema';
import type {
  RoomState, RoomSummary, RoomDelta, ActIntent, Sheet, System, Compendium, StoredValue,
} from '@vtt/schema';
import { exchange } from '@vtt/engine/events/exchange';
import { effectLabelOf } from '@vtt/engine/events/envelope';
import { findEffect, usesMax } from '@vtt/engine/engine/effects';

/** Роль из владения, а не из настройки: кто создал комнату, тот и ведущий. */
export type Role = 'gm' | 'player';

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
    @Inject(DIE) private readonly die: (sides: number) => number,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
  ) {}

  /** Комната — КОПИЯ мира: партия играет в свой экземпляр, публикация не мутирует. */
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
      system: JSON.parse(room.system) as System,
      compendium: JSON.parse(room.compendium) as Compendium,
      sheets: sheetRows.map(r => JSON.parse(r.data) as Sheet),
      members: people,
      log: await this.log(roomId),
    };
  }

  /**
   * Ход. Единственное место, где мир меняется по чужой просьбе — и потому
   * единственное, где расчёт обязан быть серверным.
   */
  async act(userId: string, intent: ActIntent): Promise<RoomDelta> {
    const room = await this.requireRoom(intent.roomId);
    if (!await this.memberOf(intent.roomId, userId)) {
      throw new ForbiddenException('вы не в этой комнате');
    }

    const system = JSON.parse(room.system) as System;
    const compendium = JSON.parse(room.compendium) as Compendium;
    const rows = await this.db.select().from(roomSheets)
      .where(eq(roomSheets.roomId, intent.roomId));
    const sheets = rows.map(r => JSON.parse(r.data) as Sheet);

    let result: { sheets: Sheet[]; reports: { fromId: string; toId: string; report: any }[] };
    try {
      result = exchange({
        system, compendium, die: this.die, sheets,
        actionId: intent.actionId, fromId: intent.fromId, toId: intent.toId,
      });
    } catch (err) {
      // Ошибка правила — это ответ игроку, а не падение сервера: «нет такого
      // действия», «цель не найдена» разбираются за столом, а не в логах.
      throw new BadRequestException((err as Error).message);
    }

    // Пишем ТОЛЬКО изменившиеся листы — сравнением по сериализованному виду.
    const before = new Map(rows.map(r => [r.sheetId, r.data]));
    const touched: Sheet[] = [];
    for (const sheet of result.sheets) {
      const next = JSON.stringify(sheet);
      if (before.get(sheet.id) === next) continue;
      await this.db.update(roomSheets).set({ data: next })
        .where(and(eq(roomSheets.roomId, intent.roomId), eq(roomSheets.sheetId, sheet.id)));
      touched.push(sheet);
    }

    const log = await this.appendLog(intent.roomId, result.reports.map(
      entry => this.describe(entry, system, sheets)));

    return { roomId: intent.roomId, sheets: touched, log };
  }

  /**
   * Правка хранимого значения игроком. Не ход и не событие: человек вписал
   * число в своё поле. Вычисляемые поля не принимаются — их считает движок.
   */
  async setValue(
    userId: string, roomId: string, sheetId: string, tag: string, value: StoredValue,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const system = JSON.parse(room.system) as System;
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

  /**
   * Новый лист в комнате. Мир волен приезжать пустым: конструктор отдаёт
   * систему, а персонажей заводит партия — как в PoC, где чарники жили
   * в приложении партии, а не у автора.
   */
  async createSheet(
    userId: string, roomId: string, name: string, kind: 'pc' | 'npc' = 'pc',
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const system = JSON.parse(room.system) as System;
    // Через схему, а не голым объектом: лист обязан быть валидным DTO
    // с рождения — иначе он падал бы позже, на первом же ходе.
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

  /**
   * Принадлежности листа: надеть/снять, выучить/забыть, повесить/снять.
   * Лист ссылается ТОЛЬКО на объявленное — сервер проверяет, что предмет,
   * действие или эффект существуют в мире комнаты, и отвергает чужое.
   */
  async setBelonging(
    userId: string, roomId: string, sheetId: string,
    list: 'equipped' | 'actions' | 'effects', id: string, on: boolean,
  ): Promise<RoomDelta> {
    const room = await this.requireRoom(roomId);
    if (!await this.memberOf(roomId, userId)) throw new ForbiddenException('вы не в этой комнате');

    const system = JSON.parse(room.system) as System;
    const compendium = JSON.parse(room.compendium) as Compendium;

    // Ссылка обязана вести в объявленное — иначе на листе повиснет пустота,
    // которая упадёт при первом же ходе, у игрока за столом.
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
        // Счётчик срабатываний ставит ДВИЖОК: «Шипы на три раза» — знание
        // эффекта, а не сервера.
        const max = usesMax(effect!);
        worn.push(max === null ? { effectId: id } : { effectId: id, usesLeft: max });
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

  // ── внутреннее ────────────────────────────────────────────────────────

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

  /** Строка журнала. Человеческая: имена, а не идентификаторы. */
  private describe(
    entry: { fromId: string; toId: string; report: any },
    system: System, sheets: Sheet[],
  ): string {
    const nameOf = (id: string) => sheets.find(s => s.id === id)?.name ?? id;
    const label = effectLabelOf(system, entry.report.effect);
    const head = entry.report.reply
      ? `${nameOf(entry.fromId)} отвечает «${label}» по ${nameOf(entry.toId)}`
      : `${nameOf(entry.fromId)} применяет «${label}» по ${nameOf(entry.toId)}`;

    if (entry.report.stopped) return `${head} — не дошло: ${entry.report.stopped.reason}`;
    const changes = (entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[];
    if (!changes.length) return head;

    const shown = changes.map(c => {
      const field = system.fields.find(f => f.tag === c.tag);
      return `${field?.label ?? c.tag}: ${c.from} → ${c.to}`;
    });
    return `${head} · ${shown.join(', ')}`;
  }
}
