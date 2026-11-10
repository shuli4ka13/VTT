import type { System } from '@vtt/schema';
import { sheetPathLabel } from './paths.ts';
import { fieldOf, fieldLinkOf, ROW } from '@vtt/engine/model/sheet-columns';
import { typeColumn } from '@vtt/engine/model/inherit';

const known = (system: System, tag: string, names?: ReadonlyMap<string, string>): boolean =>
  Boolean(fieldOf(system, tag)) || sheetPathLabel(system, tag) !== null || Boolean(names?.has(tag));

const onSheet = (system: System, tag: string, names?: ReadonlyMap<string, string>): { head: string; rest: string } | null => {
  const dot = tag.indexOf('.');
  if (dot <= 0 || tag.startsWith(`${ROW}.`) || known(system, tag, names)) return null;
  const rest = tag.slice(dot + 1);
  return known(system, rest, names) || system.effects?.[rest] ? { head: tag.slice(0, dot), rest } : null;
};

export const plainLabel = (system: System, tag: string, names?: ReadonlyMap<string, string>): string =>
  fieldOf(system, tag)?.label ?? names?.get(tag) ?? sheetPathLabel(system, tag) ?? system.effects?.[tag]?.label ?? tag;

export const pickTail = (system: System, tag: string, rest: string): string =>
  typeColumn(system, fieldLinkOf(system, fieldOf(system, tag)), rest)?.label || rest;

export function labelOfTag(system: System, tag: string, names?: ReadonlyMap<string, string>): string {
  const owned = onSheet(system, tag, names);
  if (owned) return `${labelOfTag(system, owned.rest, names)} (${names?.get(owned.head) ?? owned.head})`;
  return plainLabel(system, tag, names);
}

export function formulaAsLabels(
  system: System,
  source: string,
  names?: ReadonlyMap<string, string>,
): string {
  const lookups = source.replace(/таблица\(\s*(["'])([^"']*)\1\s*,([^,()]*(?:\([^()]*\)[^,()]*)*)(?:,\s*(["'])([^"']*)\4)?\s*\)/gu,
    (whole, _q, table: string, arg: string, _q2, column?: string) => {
      const found = system.tables?.[table];
      if (!found) return whole;
      const col = column ? typeColumn(system, table, column) : undefined;
      return `«${found.label || table}»${col ? ` → ${col.label || col.key}` : ''} по ${arg.trim()}`;
    });
  const picks = lookups.replace(/[@#]([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)\.\[([^[\]]*)\]((?:\.[\p{L}\p{N}_]+)*)/gu,
    (_, tag: string, by: string, rest: string) =>
      `${labelOfTag(system, tag, names)} · колонка по [${formulaAsLabels(system, by, names)}]${rest ? ` · ${pickTail(system, tag, rest.slice(1))}` : ''}`);
  return picks.replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, name: string) => labelOfTag(system, name, names));
}
