import type { System } from '@vtt/schema';
import { ruleLabelOf } from '@vtt/engine';

export function rowSaid(system: System, word: string): string {
  for (const table of Object.values(system.tables ?? {})) {
    const row = (table.rows ?? []).find(one => one.value === word);
    if (row?.label) return row.label;
  }
  return word;
}

export function tagSaid(system: System | undefined, tag: string): string {
  if (!system) return tag;
  return ruleLabelOf(system, tag) ?? system.tags?.[tag]?.label ?? rowSaid(system, tag);
}

export const tagsSaid = (system: System | undefined, tags: readonly string[]): string => tags.map(tag => tagSaid(system, tag)).join(', ');
