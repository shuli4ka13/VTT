import { OUTCOME_COLUMNS } from '../words/glossary.ts';
import type { System } from '../model/types.ts';

const WORD = /^[\p{L}_](?:[\p{L}\p{N}_ ]*[\p{L}\p{N}_])?$/u;

export const isTagWord = (value: unknown): value is string => typeof value === 'string' && WORD.test(value);

export function tagWords(system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    for (const row of table.rows ?? []) {
      if (isTagWord(row.value) && !out.has(row.value)) out.set(row.value, table.label || key);
    }
  }
  for (const [key, roll] of Object.entries(system.rolls ?? {})) if (isTagWord(key) && !out.has(key)) out.set(key, roll.label || key);
  return out;
}

export function outcomeWords(system: System, tags: readonly string[]): { success: string; fail: string } {
  const found: { success?: string; fail?: string } = {};
  for (const tag of tags) {
    for (const table of Object.values(system.tables ?? {})) {
      const row = (table.rows ?? []).find(r => r.value === tag);
      if (!row) continue;
      for (const side of ['success', 'fail'] as const) {
        const word = OUTCOME_COLUMNS[side];
        const column = (table.columns ?? []).find(c => c.key === word || c.label?.toLowerCase() === word);
        const cell = column ? (row.cells ?? {})[column.key] : undefined;
        if (!found[side] && typeof cell === 'string' && cell.trim()) found[side] = cell.trim();
      }
    }
  }
  return { success: found.success ?? OUTCOME_COLUMNS.success, fail: found.fail ?? OUTCOME_COLUMNS.fail };
}

export const rollTitle = (title: string, tags: readonly string[] | undefined, system?: System): string => {
  const names = [...new Set((tags ?? []).map(tag => system?.rolls?.[tag]?.label || tag))].filter(name => name.toLowerCase() !== title.toLowerCase());
  return names.length ? `${title} (${names.join(', ')})` : title;
};

export const tagsHold = (want: readonly string[] | undefined, tags: readonly string[]): boolean =>
  !want?.length || want.every(tag => tags.includes(tag));
