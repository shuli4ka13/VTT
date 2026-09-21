import type { System } from './types.ts';

type Loose = Record<string, any>;

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

export function unifyBlocks(system: System): System {
  const source = system as unknown as Loose;
  const strays = blockNames(system).filter(name => !source.groups?.[name]);
  const named = (Object.values(source.effects ?? {}) as Loose[]).some(effect => effect.category);
  if (!strays.length && !named) return system;

  const next: Loose = JSON.parse(JSON.stringify(source));
  next.groups ??= {};
  for (const effect of Object.values(next.effects ?? {}) as Loose[]) {
    if (effect.category === undefined) continue;
    effect.group ??= effect.category;
    delete effect.category;
  }
  for (const name of blockNames(next as unknown as System)) next.groups[name] ??= {};
  return next as unknown as System;
}
