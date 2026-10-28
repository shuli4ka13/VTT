import type { System, Table, TableRow } from './types.ts';
import { isBlank, orDefault } from './blank.ts';

export const VALUE_COLUMN = 'value';

export function tableOf(system: System, key: string | undefined): Table | undefined {
  if (!key) return undefined;
  return system.tables?.[key];
}

export const isRange = (table: Table): boolean => table.key === 'range';

export const isNumberKeyed = (table: Table | undefined): boolean => table?.key === 'number' || table?.key === 'range';

export function staticCell(system: System, table: string | undefined, value: unknown, path: readonly string[]): unknown {
  let at = table;
  let current = value;
  for (const key of path) {
    const spec = at ? (system.tables?.[at]?.columns ?? []).find(one => one.key === key) : undefined;
    if (!spec) return null;
    const row = (system.tables?.[at!]?.rows ?? []).find(one => String(one.value) === String(current));
    const cell = row ? (row.cells ?? {})[key] : undefined;
    current = orDefault(cell, spec);
    at = linkOf(spec);
  }
  return current ?? null;
}

export const linkOf = (column: { kind?: string; from?: string } | undefined): string | undefined =>
  (column?.from && (column.kind === 'choice' || column.kind === 'number') ? column.from : undefined);

export function rowByKey(table: Table | undefined, key: unknown): TableRow | undefined {
  if (!table || isBlank(key)) return undefined;
  if (isRange(table)) {
    const n = Number(key);
    return (table.rows ?? []).find(r => n >= (r.from ?? -Infinity) && n <= (r.to ?? Infinity));
  }
  return (table.rows ?? []).find(r => String(r.value) === String(key));
}

export const keyOf = (table: Table) => table.key ?? 'word';

export const rowsOf = (table: Table | undefined): TableRow[] => table?.rows ?? [];

export const columnsOf = (table: Table | undefined) => table?.columns ?? [];

export const cellOf = (row: TableRow | undefined, column: string): unknown =>
  (row?.cells ?? {})[column];

export const isWordTable = (table: Table): boolean => !isRange(table);

export function choiceTables(system: System): [string, Table][] {
  return Object.entries(system.tables ?? {}).filter(([, table]) => isWordTable(table) && hasRows(table));
}

export const hasRows = (table: Table | undefined): boolean => Boolean(table) && table!.shape !== 'single' && table!.shape !== 'book';

export const rowTables = (system: System): [string, Table][] =>
  Object.entries(system.tables ?? {}).filter(([, table]) => hasRows(table));

export const numberTables = (system: System): [string, Table][] =>
  rowTables(system).filter(([, table]) => isNumberKeyed(table));

export function degreeWords(system: System, tableId: string | undefined): string[] {
  const table = tableId ? system.tables?.[tableId] : undefined;
  const words = (table?.rows ?? []).map(row => cellOf(row, VALUE_COLUMN) ?? row.value);
  return [...new Set(words.filter(word => word !== undefined && word !== null && word !== '').map(String))];
}
