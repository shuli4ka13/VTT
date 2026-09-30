import type { System, Field } from './types.ts';
import { fieldsOf } from './sheet-columns.ts';

type Loose = Record<string, unknown>;

export const NO_BLOCK = 'Без блока';

export function blockNames(system: System): string[] {
  const out = new Set<string>(Object.keys(system.groups ?? {}));
  for (const field of fieldsOf(system)) if (field.group) out.add(field.group);
  for (const effect of Object.values(system.effects ?? {})) {
    if (effect.group) out.add(effect.group);
  }
  for (const kind of Object.values(system.records ?? {})) if (kind.group) out.add(kind.group);
  return [...out];
}

export function blockOf(system: System, thing: { group?: string; extends?: string } | undefined): string | undefined {
  let at = thing;
  const seen = new Set<unknown>();
  while (at && !seen.has(at)) {
    if (at.group) return at.group;
    seen.add(at);
    const base = (at as Loose).extends;
    at = base
      ? (system.effects?.[String(base)] ?? system.records?.[String(base)]) as typeof at
      : undefined;
  }
  return undefined;
}

export interface BlockUse { fields: number; effects: number; records: number }

export function blockUse(system: System, name: string): BlockUse {
  let fields = 0; let effects = 0; let records = 0;
  for (const field of fieldsOf(system)) if (field.group === name) fields += 1;
  for (const effect of Object.values(system.effects ?? {})) if (blockOf(system, effect) === name) effects += 1;
  for (const kind of Object.values(system.records ?? {})) if (blockOf(system, kind) === name) records += 1;
  return { fields, effects, records };
}

export function fieldsByBlock(system: System, fields: readonly Field[] = fieldsOf(system)): [string, Field[]][] {
  const blocks = new Map<string, Field[]>();
  for (const name of Object.keys(system.groups ?? {})) blocks.set(name, []);
  for (const field of fields) {
    const key = field.group ?? NO_BLOCK;
    const list = blocks.get(key);
    if (list) list.push(field);
    else blocks.set(key, [field]);
  }
  return [...blocks].filter(([, list]) => list.length > 0);
}
