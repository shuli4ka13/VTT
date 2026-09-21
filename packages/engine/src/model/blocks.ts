import type { System } from './types.ts';

type Loose = Record<string, unknown>;

export const NO_BLOCK = 'Без блока';

export function blockNames(system: System): string[] {
  const out = new Set<string>(Object.keys(system.groups ?? {}));
  for (const field of system.fields ?? []) if (field.group) out.add(field.group);
  for (const effect of Object.values(system.effects ?? {})) {
    const name = (effect as Loose).group ?? (effect as Loose).category;
    if (name) out.add(String(name));
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
  for (const field of system.fields ?? []) if (field.group === name) fields += 1;
  for (const effect of Object.values(system.effects ?? {})) if (blockOf(system, effect) === name) effects += 1;
  for (const kind of Object.values(system.records ?? {})) if (blockOf(system, kind) === name) records += 1;
  return { fields, effects, records };
}

type Blocks = Record<string, Record<string, unknown>>;

export function unifyBlocks(system: System): System {
  const known = (system.groups ?? {}) as Blocks;
  const strays = blockNames(system).filter(name => !known[name]);
  const named = (Object.values(system.effects ?? {}) as Loose[]).some(effect => effect.category);
  if (!strays.length && !named) return system;

  const next = JSON.parse(JSON.stringify(system)) as System & { groups: Blocks };
  next.groups ??= {};
  for (const effect of Object.values(next.effects ?? {}) as Loose[]) {
    if (effect.category === undefined) continue;
    effect.group ??= effect.category;
    delete effect.category;
  }
  for (const name of blockNames(next)) next.groups[name] ??= {};
  return next;
}
