// Публикация миров. Мир приходит из конструктора одним документом и таким же
// уезжает в комнату.
//
// Валидация на входе — не формальность: мир, не прошедший схему, положил бы
// не сервер, а первый ход первой партии, и разбираться пришлось бы уже за
// столом. Поэтому не проходит — не публикуется.

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DB, CLOCK, IDS } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { worlds, users } from '../db/schema.ts';
import { world as W } from '@vtt/schema';
import type { World, WorldSummary } from '@vtt/schema';
import { migrateWorld } from '@vtt/engine/model/migrate';

@Injectable()
export class WorldsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
  ) {}

  async publish(ownerId: string, title: string, incoming: unknown): Promise<{ id: string }> {
    // Мир мог быть собран в старом формате: миграция ДО проверки, иначе
    // схема нового формата честно отвергнет старый и он станет незагружаемым.
    const migrated = migrateWorld(incoming as Record<string, unknown>);
    const parsed = W.world.safeParse(migrated);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'мир не проходит схему и потому не публикуется',
        issues: parsed.error.issues.slice(0, 5)
          .map((i: { path: PropertyKey[]; message: string }) =>
            `${i.path.join('.') || '(корень)'}: ${i.message}`),
      });
    }

    const id = this.newId();
    await this.db.insert(worlds).values({
      id, title, ownerId,
      data: JSON.stringify(parsed.data),
      updatedAt: this.now(),
    });
    return { id };
  }

  async list(): Promise<WorldSummary[]> {
    const rows = await this.db.select().from(worlds).orderBy(desc(worlds.updatedAt));
    const out: WorldSummary[] = [];

    for (const row of rows) {
      const data = JSON.parse(row.data) as World;
      const owner = await this.db.select().from(users).where(eq(users.id, row.ownerId));
      out.push({
        id: row.id,
        title: row.title,
        systemName: data.system.name ?? data.system.id ?? 'без имени',
        authorName: owner[0]?.name ?? 'неизвестен',
        sheetCount: data.sheets.length,
        updatedAt: row.updatedAt,
      });
    }
    return out;
  }

  async get(id: string): Promise<World> {
    const rows = await this.db.select().from(worlds).where(eq(worlds.id, id));
    const row = rows[0];
    if (!row) throw new NotFoundException(`мира «${id}» на сервере нет`);
    return JSON.parse(row.data) as World;
  }
}
