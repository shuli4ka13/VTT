import type { System, FieldOption, Field, Effect } from './types.ts';
import { rowsOf, tableOf } from './tables.ts';

export function listOf(system: System, key: string | undefined): FieldOption[] | undefined {
  if (!key) return undefined;
  const table = tableOf(system, key);
  if (!table) return undefined;
  return rowsOf(table)
    .filter(row => row.value !== undefined)
    .map(row => ({ value: row.value as FieldOption['value'], label: row.label || String(row.value) }));
}

export function optionsOf(system: System, field: Field): FieldOption[] {
  return listOf(system, field.optionsFrom) ?? field.options ?? [];
}

export function tagTablesOf(effect: Effect | undefined): string[] {
  const from = effect?.tagsFrom;
  if (!from) return [];
  return Array.isArray(from) ? from : [from];
}

export function tagsOf(system: System, effect: Effect): string[] {
  const tables = tagTablesOf(effect);
  if (!tables.length) return effect.tags ?? [];
  return tables.flatMap(table => (listOf(system, table) ?? []).map(option => String(option.value)));
}

export function listUsers(system: System, key: string): string[] {
  const out: string[] = [];
  const from = (thing: unknown): string | undefined => (thing as { from?: string }).from;
  for (const field of system.fields ?? []) {
    if (field.optionsFrom === key) out.push(`поле «${field.label}»`);
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    if (tagTablesOf(effect).includes(key)) out.push(`эффект «${effect.label ?? id}»`);
    for (const param of (effect.params ?? [])) {
      if (from(param) === key) out.push(`«${param.label ?? param.key}» у эффекта «${effect.label ?? id}»`);
    }
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    for (const prop of (kind.props ?? [])) {
      if (from(prop) === key) out.push(`свойство «${prop.label ?? prop.key}» у типа «${kind.label ?? rk}»`);
    }
  }
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    for (const column of (table.columns ?? [])) {
      if (column.from === key) out.push(`колонка «${column.label ?? column.key}» таблицы «${table.label ?? id}»`);
    }
  }
  return out;
}
