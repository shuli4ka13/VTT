import {
  BadRequestException, ConflictException, ForbiddenException,
  Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { world as schemas } from '@vtt/schema';
import { lintSystem, lintCompendium, errorsOf, describeWhere } from '@vtt/engine/model/lint';
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

  async createSystem(ownerId: string, title: string, data: unknown) {
    const parsed = schemas.system.safeParse(data);
    if (!parsed.success) throw new BadRequestException('система не проходит схему');
    const id = this.newId();
    const updatedAt = this.now();
    await this.db.insert(publishedSystems).values({
      id, title, ownerId, data: JSON.stringify(parsed.data),
      publishedData: null, status: 'draft', updatedAt,
    });
    return { id, updatedAt };
  }

  async saveSystem(ownerId: string, id: string, title: string, data: unknown, since?: string) {
    const parsed = schemas.system.safeParse(data);
    if (!parsed.success) throw new BadRequestException('система не проходит схему');
    const row = await this.ownedSystem(ownerId, id);
    if (since && since !== row.updatedAt) {
      throw new ConflictException(
        'систему изменили в другом месте — обновите страницу, иначе затрёте ту правку');
    }
    const updatedAt = this.now();
    await this.db.update(publishedSystems)
      .set({ title, data: JSON.stringify(parsed.data), updatedAt })
      .where(eq(publishedSystems.id, id));
    return { id, updatedAt };
  }

  async publishSystem(ownerId: string, id: string) {
    const row = await this.ownedSystem(ownerId, id);
    const parsed = schemas.system.safeParse(JSON.parse(row.data));
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'сохранённая система не проходит схему — публиковать нельзя',
        issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const problems = errorsOf(lintSystem(parsed.data as System));
    if (problems.length) {
      throw new BadRequestException({
        message: `система не готова к публикации: ${countErrors(problems.length)} — смотрите «Проблемы»`,
        issues: problems.slice(0, 5).map(p => `${describeWhere(p.where, parsed.data as System)}: ${p.text}`),
      });
    }
    const updatedAt = this.now();
    await this.db.update(publishedSystems)
      .set({ publishedData: row.data, status: 'published', updatedAt })
      .where(eq(publishedSystems.id, id));
    return { id, updatedAt };
  }

  async systemFor(id: string, viewerId?: string) {
    const row = (await this.db.select().from(publishedSystems).where(eq(publishedSystems.id, id)))[0];
    if (!row) throw new NotFoundException(`системы «${id}» нет`);
    return row.ownerId === viewerId ? this.system(id) : this.playableSystem(id);
  }

  async compendiumFor(id: string, viewerId?: string) {
    const row = (await this.db.select().from(publishedCompendiums)
      .where(eq(publishedCompendiums.id, id)))[0];
    if (!row) throw new NotFoundException(`компендиума «${id}» нет`);
    return row.ownerId === viewerId ? this.compendium(id) : this.playableCompendium(id);
  }

  async playableSystem(id: string): Promise<{ id: string; title: string; updatedAt: string; system: System }> {
    const row = (await this.db.select().from(publishedSystems).where(eq(publishedSystems.id, id)))[0];
    if (!row) throw new NotFoundException(`системы «${id}» нет`);
    if (!row.publishedData) {
      throw new BadRequestException(`система «${row.title}» ещё не опубликована`);
    }
    return {
      id: row.id, title: row.title, updatedAt: row.updatedAt,
      system: JSON.parse(row.publishedData) as System,
    };
  }

  private async ownedSystem(ownerId: string, id: string) {
    const row = (await this.db.select().from(publishedSystems).where(eq(publishedSystems.id, id)))[0];
    if (!row) throw new NotFoundException(`системы «${id}» нет`);
    if (row.ownerId !== ownerId) throw new ForbiddenException('система принадлежит другому автору');
    return row;
  }

  async systems(viewerId?: string) {
    const visible = viewerId
      ? or(eq(publishedSystems.status, 'published'), eq(publishedSystems.ownerId, viewerId))
      : eq(publishedSystems.status, 'published');
    const rows = await this.db.select().from(publishedSystems)
      .where(visible).orderBy(desc(publishedSystems.updatedAt));
    return Promise.all(rows.map(async row => {
      const data = JSON.parse(row.data) as System;
      return { id: row.id, title: row.title, systemName: data.name ?? data.id,
        authorName: await this.author(row.ownerId), updatedAt: row.updatedAt,
        status: row.status === 'published' ? 'published' as const : 'draft' as const };
    }));
  }

  async system(id: string): Promise<{ id: string; title: string; updatedAt: string; system: System }> {
    const row = (await this.db.select().from(publishedSystems).where(eq(publishedSystems.id, id)))[0];
    if (!row) throw new NotFoundException(`системы «${id}» нет`);
    return {
      id: row.id, title: row.title, updatedAt: row.updatedAt,
      system: JSON.parse(row.data) as System,
    };
  }

  async createCompendium(ownerId: string, title: string, systemId: string, data: unknown) {
    const parsed = schemas.compendium.safeParse(data);
    if (!parsed.success) throw new BadRequestException('компендиум не проходит схему');
    const system = await this.system(systemId);
    const unknown = [...(parsed.data.items ?? []), ...(parsed.data.actions ?? [])]
      .find(record => !system.system.records?.[String(record.rk)]);
    if (unknown) throw new BadRequestException(
      `запись «${unknown.label ?? unknown.id}» не соответствует выбранной системе`);
    const id = this.newId();
    const updatedAt = this.now();
    await this.db.insert(publishedCompendiums).values({
      id, title, ownerId, systemId, data: JSON.stringify(parsed.data),
      publishedData: null, status: 'draft', updatedAt,
    });
    return { id, updatedAt };
  }

  async saveCompendium(ownerId: string, id: string, title: string, data: unknown, since?: string) {
    const parsed = schemas.compendium.safeParse(data);
    if (!parsed.success) throw new BadRequestException('компендиум не проходит схему');
    const row = await this.ownedCompendium(ownerId, id);
    if (since && since !== row.updatedAt) {
      throw new ConflictException(
        'компендиум изменили в другом месте — обновите страницу, иначе затрёте ту правку');
    }
    const updatedAt = this.now();
    await this.db.update(publishedCompendiums)
      .set({ title, data: JSON.stringify(parsed.data), updatedAt })
      .where(eq(publishedCompendiums.id, id));
    return { id, updatedAt };
  }

  async publishCompendium(ownerId: string, id: string) {
    const row = await this.ownedCompendium(ownerId, id);
    const compendium = JSON.parse(row.data) as Compendium;
    const system = await this.system(row.systemId);
    this.assertRecordsFilled(system.system, compendium);
    const problems = errorsOf(lintCompendium(system.system, compendium));
    if (problems.length) {
      throw new BadRequestException({
        message: `компендиум не готов к публикации: ${countErrors(problems.length)} — ${problems[0]!.text}`,
        issues: problems.slice(0, 5).map(p => `${describeWhere(p.where, system.system, compendium)}: ${p.text}`),
      });
    }
    const updatedAt = this.now();
    await this.db.update(publishedCompendiums)
      .set({ publishedData: row.data, status: 'published', updatedAt })
      .where(eq(publishedCompendiums.id, id));
    return { id, updatedAt };
  }

  private assertRecordsFilled(system: System, compendium: Compendium): void {
    for (const record of [...(compendium.items ?? []), ...(compendium.actions ?? [])]) {
      const kind = system.records?.[String(record.rk)];
      const bindings = [...(kind?.bindings ?? []), ...(record.activities ?? [])];
      for (const binding of bindings) {
        for (const arg of Object.values(binding.args ?? {})) {
          if (!arg || typeof arg !== 'object' || Array.isArray(arg)) continue;
          const ref = arg as Record<string, unknown>;
          if (typeof ref.prop !== 'string' || ref.optional === true) continue;
          const value = record.props?.[ref.prop];
          if (value === undefined || value === '') {
            const label = kind?.props?.find(p => p.key === ref.prop)?.label ?? ref.prop;
            throw new BadRequestException(
              `запись «${record.label ?? record.id}»: не заполнено «${label}»`);
          }
        }
      }
    }
  }

  async playableCompendium(id: string) {
    const row = (await this.db.select().from(publishedCompendiums)
      .where(eq(publishedCompendiums.id, id)))[0];
    if (!row) throw new NotFoundException(`компендиума «${id}» нет`);
    if (!row.publishedData) {
      throw new BadRequestException(`компендиум «${row.title}» ещё не опубликован`);
    }
    return { id: row.id, title: row.title, systemId: row.systemId, updatedAt: row.updatedAt,
      compendium: JSON.parse(row.publishedData) as Compendium };
  }

  private async ownedCompendium(ownerId: string, id: string) {
    const row = (await this.db.select().from(publishedCompendiums)
      .where(eq(publishedCompendiums.id, id)))[0];
    if (!row) throw new NotFoundException(`компендиума «${id}» нет`);
    if (row.ownerId !== ownerId) throw new ForbiddenException('компендиум принадлежит другому автору');
    return row;
  }

  async compendiums(systemId?: string, viewerId?: string) {
    const visible = viewerId
      ? or(eq(publishedCompendiums.status, 'published'), eq(publishedCompendiums.ownerId, viewerId))
      : eq(publishedCompendiums.status, 'published');
    const rows = systemId
      ? await this.db.select().from(publishedCompendiums)
        .where(and(eq(publishedCompendiums.systemId, systemId), visible))
        .orderBy(desc(publishedCompendiums.updatedAt))
      : await this.db.select().from(publishedCompendiums)
        .where(visible).orderBy(desc(publishedCompendiums.updatedAt));
    return Promise.all(rows.map(async row => {
      const data = JSON.parse(row.data) as Compendium;
      const system = await this.system(row.systemId);
      return { id: row.id, title: row.title, systemId: row.systemId,
        systemName: system.system.name ?? system.system.id,
        authorName: await this.author(row.ownerId),
        itemCount: (data.items?.length ?? 0) + (data.actions?.length ?? 0), updatedAt: row.updatedAt,
        status: row.status === 'published' ? 'published' as const : 'draft' as const };
    }));
  }

  async compendium(id: string) {
    const row = (await this.db.select().from(publishedCompendiums)
      .where(eq(publishedCompendiums.id, id)))[0];
    if (!row) throw new NotFoundException(`компендиума «${id}» нет`);
    return { id: row.id, title: row.title, systemId: row.systemId, updatedAt: row.updatedAt,
      compendium: JSON.parse(row.data) as Compendium };
  }

  private async author(ownerId: string) {
    const row = (await this.db.select().from(users).where(eq(users.id, ownerId)))[0];
    return row?.name ?? 'неизвестен';
  }
}

const countErrors = (n: number): string => {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  const word = teen ? 'ошибок' : last === 1 ? 'ошибка' : last >= 2 && last <= 4 ? 'ошибки' : 'ошибок';
  return `${n} ${word}`;
};
