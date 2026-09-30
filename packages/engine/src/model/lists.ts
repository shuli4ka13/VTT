import type { System, FieldOption, Field, Effect } from './types.ts';
import { rowsOf, tableOf } from './tables.ts';
import { fieldsOf } from './sheet-columns.ts';
import { recordKinds } from './owned.ts';

export function listOf(system: System, key: string | undefined): FieldOption[] | undefined {
  if (!key) return undefined;
  const table = tableOf(system, key);
  if (!table) return undefined;
  return rowsOf(table)
    .filter(row => row.value !== undefined)
    .map(row => ({ value: row.value as FieldOption['value'], label: row.label || String(row.value) }));
}

export const choiceTableOf = (field: Field | undefined): string | undefined =>
  (field?.value.kind === 'stored' && field.value.type === 'choice' ? field.value.from : undefined);

export function optionsOf(system: System, field: Field): FieldOption[] {
  return listOf(system, choiceTableOf(field)) ?? [];
}

export function tagTablesOf(effect: Effect | undefined): string[] {
  return [...new Set((effect?.params ?? [])
    .filter(p => p.kind === 'choice' && typeof p.from === 'string' && p.from)
    .map(p => String(p.from)))];
}

export const amountParamOf = (effect: Effect | undefined) =>
  (effect?.params ?? []).find(p => (p as { role?: string }).role === 'amount');

export function tagsOf(system: System, effect: Effect): string[] {
  return tagTablesOf(effect).flatMap(table => (listOf(system, table) ?? []).map(option => String(option.value)));
}

export function listUsers(system: System, key: string): string[] {
  const out: string[] = [];
  const from = (thing: unknown): string | undefined => (thing as { from?: string }).from;
  for (const field of fieldsOf(system)) {
    if (choiceTableOf(field) === key) out.push(`поле «${field.label}»`);
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    if (tagTablesOf(effect).includes(key)) out.push(`эффект «${effect.label ?? id}»`);
    for (const param of (effect.params ?? [])) {
      if (from(param) === key) out.push(`«${param.label ?? param.key}» у эффекта «${effect.label ?? id}»`);
    }
  }
  for (const [rk, kind] of recordKinds(system)) {
    for (const prop of (kind.columns ?? [])) {
      if (from(prop) === key) out.push(`свойство «${prop.label ?? prop.key}» у типа «${kind.label ?? rk}»`);
    }
  }
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (table.shape === 'single' || table.shape === 'book') continue;
    for (const column of (table.columns ?? [])) {
      if (column.from === key) out.push(`колонка «${column.label ?? column.key}» таблицы «${table.label ?? id}»`);
    }
  }
  return out;
}
