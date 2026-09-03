import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DB, CLOCK, IDS } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { worlds, users } from '../db/schema.ts';
import { world as W } from '@vtt/schema';
import type { Compendium, Sheet, World, WorldSummary } from '@vtt/schema';
import { CatalogService } from '../catalog/catalog.service.ts';

@Injectable()
export class WorldsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  async publish(ownerId: string, title: string, systemId: string,
    compendiumIds: string[], sheets: Sheet[]): Promise<{ id: string }> {
    await this.catalog.playableSystem(systemId);
    await this.mergeCompendiums(systemId, compendiumIds);
    const parsedSheets = W.sheet.array().safeParse(sheets);
    if (!parsedSheets.success) throw new BadRequestException('листы мира не проходят схему');

    const id = this.newId();
    await this.db.insert(worlds).values({
      id, title, ownerId, systemId,
      compendiumIds: JSON.stringify(compendiumIds),
      sheets: JSON.stringify(parsedSheets.data),
      updatedAt: this.now(),
    });
    return { id };
  }

  async list(): Promise<WorldSummary[]> {
    const rows = await this.db.select().from(worlds).orderBy(desc(worlds.updatedAt));
    const out: WorldSummary[] = [];

    for (const row of rows) {
      const system = await this.catalog.playableSystem(row.systemId);
      const owner = await this.db.select().from(users).where(eq(users.id, row.ownerId));
      out.push({
        id: row.id,
        title: row.title,
        systemName: system.system.name ?? system.system.id ?? 'без имени',
        compendiumCount: (JSON.parse(row.compendiumIds) as string[]).length,
        authorName: owner[0]?.name ?? 'неизвестен',
        sheetCount: (JSON.parse(row.sheets) as Sheet[]).length,
        updatedAt: row.updatedAt,
      });
    }
    return out;
  }

  async get(id: string): Promise<World> {
    const rows = await this.db.select().from(worlds).where(eq(worlds.id, id));
    const row = rows[0];
    if (!row) throw new NotFoundException(`мира «${id}» на сервере нет`);
    const system = await this.catalog.playableSystem(row.systemId);
    const compendium = await this.mergeCompendiums(
      row.systemId, JSON.parse(row.compendiumIds) as string[]);
    return { system: system.system, compendium,
      sheets: JSON.parse(row.sheets) as Sheet[] };
  }

  private async mergeCompendiums(systemId: string, ids: string[]): Promise<Compendium> {
    const merged: Compendium = { items: [], actions: [] };
    const seen = new Set<string>();
    for (const id of ids) {
      const published = await this.catalog.playableCompendium(id);
      if (published.systemId !== systemId) {
        throw new BadRequestException(`компендиум «${published.title}» относится к другой системе`);
      }
      for (const [kind, records] of [
        ['items', published.compendium.items ?? []],
        ['actions', published.compendium.actions ?? []],
      ] as const) {
        for (const record of records) {
          if (seen.has(record.id)) throw new BadRequestException(
            `в выбранных компендиумах повторяется id записи «${record.id}»`);
          seen.add(record.id);
          merged[kind]!.push(record);
        }
      }
    }
    return merged;
  }
}
