import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { world as schemas } from '@vtt/schema';
import type { Compendium, System } from '@vtt/schema';
import { DB, CLOCK, IDS } from '../common/tokens.ts';
import type { Db } from '../db/db.ts';
import { publishedCompendiums, publishedSystems, users } from '../db/schema.ts';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: () => string,
    @Inject(IDS) private readonly newId: () => string,
  ) {}

  async publishSystem(ownerId: string, title: string, data: unknown) {
    const parsed = schemas.system.safeParse(data);
    if (!parsed.success) throw new BadRequestException('система не проходит схему');
    const id = this.newId();
    await this.db.insert(publishedSystems).values({
      id, title, ownerId, data: JSON.stringify(parsed.data), updatedAt: this.now(),
    });
    return { id };
  }

  async systems() {
    const rows = await this.db.select().from(publishedSystems).orderBy(desc(publishedSystems.updatedAt));
    return Promise.all(rows.map(async row => {
      const data = JSON.parse(row.data) as System;
      return { id: row.id, title: row.title, systemName: data.name ?? data.id,
        authorName: await this.author(row.ownerId), updatedAt: row.updatedAt };
    }));
  }

  async system(id: string): Promise<{ id: string; title: string; system: System }> {
    const row = (await this.db.select().from(publishedSystems).where(eq(publishedSystems.id, id)))[0];
    if (!row) throw new NotFoundException(`системы «${id}» нет`);
    return { id: row.id, title: row.title, system: JSON.parse(row.data) as System };
  }

  async publishCompendium(ownerId: string, title: string, systemId: string, data: unknown) {
    const parsed = schemas.compendium.safeParse(data);
    if (!parsed.success) throw new BadRequestException('компендиум не проходит схему');
    const system = await this.system(systemId);
    const unknown = [...(parsed.data.items ?? []), ...(parsed.data.actions ?? [])]
      .find(record => !system.system.records?.[String(record.rk)]);
    if (unknown) throw new BadRequestException(
      `запись «${unknown.label ?? unknown.id}» не соответствует выбранной системе`);
    const id = this.newId();
    await this.db.insert(publishedCompendiums).values({
      id, title, ownerId, systemId, data: JSON.stringify(parsed.data), updatedAt: this.now(),
    });
    return { id };
  }

  async compendiums(systemId?: string) {
    const rows = systemId
      ? await this.db.select().from(publishedCompendiums)
        .where(eq(publishedCompendiums.systemId, systemId)).orderBy(desc(publishedCompendiums.updatedAt))
      : await this.db.select().from(publishedCompendiums).orderBy(desc(publishedCompendiums.updatedAt));
    return Promise.all(rows.map(async row => {
      const data = JSON.parse(row.data) as Compendium;
      const system = await this.system(row.systemId);
      return { id: row.id, title: row.title, systemId: row.systemId,
        systemName: system.system.name ?? system.system.id,
        authorName: await this.author(row.ownerId),
        itemCount: (data.items?.length ?? 0) + (data.actions?.length ?? 0), updatedAt: row.updatedAt };
    }));
  }

  async compendium(id: string) {
    const row = (await this.db.select().from(publishedCompendiums)
      .where(eq(publishedCompendiums.id, id)))[0];
    if (!row) throw new NotFoundException(`компендиума «${id}» нет`);
    return { id: row.id, title: row.title, systemId: row.systemId,
      compendium: JSON.parse(row.data) as Compendium };
  }

  private async author(ownerId: string) {
    const row = (await this.db.select().from(users).where(eq(users.id, ownerId)))[0];
    return row?.name ?? 'неизвестен';
  }
}
