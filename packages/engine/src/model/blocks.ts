import type { System, Field } from './types.ts';
import { fieldsOf } from './sheet-columns.ts';
import { kindsOf, kindOf } from './owned.ts';
import { basedOn } from './inherit.ts';


export const NO_BLOCK = 'Без блока';

export const sheetBlockNames = (system: System): string[] => (system.blocks ?? []).map(block => block.name);

export function blockNames(system: System): string[] {
  const out = new Set<string>(Object.keys(system.groups ?? {}));
  for (const name of sheetBlockNames(system)) out.add(name);
  for (const effect of Object.values(system.effects ?? {})) {
    if (effect.group) out.add(effect.group);
  }
  for (const [, kind] of kindsOf(system)) if (kind.block) out.add(kind.block);
  return [...out];
}

export function blockOf(system: System, thing: { group?: string; block?: string; extends?: string } | undefined): string | undefined {
  let at = thing;
  const seen = new Set<unknown>();
  while (at && !seen.has(at)) {
    if (at.group ?? at.block) return at.group ?? at.block;
    seen.add(at);
    const base = basedOn(at);
    at = base
      ? (system.effects?.[String(base)] ?? kindOf(system, String(base))) as typeof at
      : undefined;
  }
  return undefined;
}

export interface BlockUse { fields: number; effects: number; records: number }

export function blockUse(system: System, name: string): BlockUse {
  let fields = 0; let effects = 0; let records = 0;
  for (const field of fieldsOf(system)) if ((field.placements ?? []).some(place => place.group === name)) fields += 1;
  for (const effect of Object.values(system.effects ?? {})) if (blockOf(system, effect) === name) effects += 1;
  for (const [, kind] of kindsOf(system)) if (blockOf(system, kind) === name) records += 1;
  return { fields, effects, records };
}

export function fieldsByBlock(system: System, fields: readonly Field[] = fieldsOf(system), shown: (block: string) => boolean = () => true): [string, Field[]][] {
  const blocks = new Map<string, Field[]>();
  for (const name of sheetBlockNames(system)) blocks.set(name, []);
  const put = (key: string, field: Field) => {
    const list = blocks.get(key);
    if (list) list.push(field);
    else blocks.set(key, [field]);
  };
  for (const field of fields) {
    if (!field.placements?.length) { put(NO_BLOCK, field); continue; }
    for (const place of field.placements) {
      if (!shown(place.group)) continue;
      const { section: _s, sectionAt: _a, sectionBy: _b, control: _c, ...rest } = field;
      put(place.group, { ...rest, ...place });
    }
  }
  for (const list of blocks.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [...blocks].filter(([, list]) => list.length > 0);
}
