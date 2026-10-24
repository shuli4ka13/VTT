import { useMemo } from 'react';
import { referencesOf } from '@vtt/engine/model/references';
import type { Where, RefKind } from '@vtt/engine/model/references';
import type { System, Compendium } from '@vtt/schema';
import { useWorld, useBook } from '../../store/world.ts';
import { whereLabel } from './problems.ts';

export type UsageIndex = Map<string, Where[]>;

export const usageKey = (kind: RefKind, key: string): string => `${kind}:${key}`;

export function usageIndex(system: System, compendium?: Compendium): UsageIndex {
  const index: UsageIndex = new Map();
  for (const ref of referencesOf(system, compendium)) {
    const key = usageKey(ref.kind, ref.key);
    const list = index.get(key) ?? [];
    list.push(ref.from);
    index.set(key, list);
  }
  return index;
}

export function useUsage(): UsageIndex {
  const system = useWorld(s => s.system);
  const compendium = useBook();
  return useMemo(() => usageIndex(system, compendium), [system, compendium]);
}

export const inUse = (index: UsageIndex, kind: RefKind, key: string): boolean => index.has(usageKey(kind, key));

export const insideTable = (table: string) => (where: Where): boolean =>
  (where.tab === 'sheet' && Boolean(where.field?.startsWith(`${table}.`)))
  || (where.tab === 'rules' && where.section === 'tables' && where.key === table);

export function usersOf(index: UsageIndex, kind: RefKind, key: string, system: System, skip: (where: Where) => boolean = () => false): string[] {
  const out = new Set<string>();
  for (const where of (index.get(usageKey(kind, key)) ?? []).filter(one => !skip(one))) {
    const short: Where = where.tab === 'effects' ? { tab: 'effects', effect: where.effect }
      : where.tab === 'records' ? { tab: 'records', kind: where.kind }
        : where;
    out.add(whereLabel(short, system));
  }
  return [...out];
}
