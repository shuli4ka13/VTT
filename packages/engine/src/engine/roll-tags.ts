import { OUTCOME_COLUMNS, OUTCOME_WORDS } from '../words/glossary.ts';
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
        const column = (table.columns ?? []).find(c => OUTCOME_COLUMNS[side].includes(c.key));
        const cell = column ? (row.cells ?? {})[column.key] : undefined;
        if (!found[side] && typeof cell === 'string' && cell.trim()) found[side] = cell.trim();
      }
    }
  }
  return { success: found.success ?? OUTCOME_WORDS.success, fail: found.fail ?? OUTCOME_WORDS.fail };
}

const ROW_WORDS = new WeakMap<object, Map<string, string>>();

function rowWords(system: System): Map<string, string> {
  const known = ROW_WORDS.get(system);
  if (known) return known;
  const words = new Map<string, string>();
  for (const table of Object.values(system.tables ?? {})) {
    for (const row of table.rows ?? []) {
      if (typeof row.value === 'string' && row.label && !words.has(row.value)) words.set(row.value, row.label);
    }
  }
  ROW_WORDS.set(system, words);
  return words;
}

export function tagSaid(system: System | undefined, tag: string): string {
  if (!system) return tag;
  return system.rolls?.[tag]?.label || system.tags?.[tag]?.label || rowWords(system).get(tag) || tag;
}

export const rowSaid = (system: System | undefined, table: string, value: unknown): string => {
  const row = (system?.tables?.[table]?.rows ?? []).find(one => one.value === value);
  return row?.label || String(value);
};

export function partSaid(system: System | undefined, name: string): string {
  for (const constant of Object.values(system?.constants ?? {}) as { dice?: { name?: string; label?: string }[] }[]) {
    const part = (constant?.dice ?? []).find(one => one.name === name);
    if (part?.label) return part.label;
  }
  return name;
}

export const rollTitle = (title: string, tags: readonly string[] | undefined, system?: System): string => {
  const names = [...new Set((tags ?? []).map(tag => tagSaid(system, tag)))].filter(name => name.toLowerCase() !== title.toLowerCase());
  return names.length ? `${title} (${names.join(', ')})` : title;
};

export const tagsHold = (want: readonly string[] | undefined, tags: readonly string[]): boolean =>
  !want?.length || want.every(tag => tags.includes(tag));

export function tagsFit(spec: { tags?: readonly string[]; anyTags?: readonly string[]; notTags?: readonly string[] }, tags: readonly string[]): boolean {
  if (spec.tags?.length && !tagsHold([...spec.tags], tags)) return false;
  if (spec.anyTags?.length && !spec.anyTags.some(t => tags.includes(t))) return false;
  if (spec.notTags?.length && spec.notTags.some(t => tags.includes(t))) return false;
  return true;
}
