import type { System, Table, TableRow } from './types.ts';

export const VALUE_COLUMN = 'value';

export function tableOf(system: System, key: string | undefined): Table | undefined {
  if (!key) return undefined;
  return system.tables?.[key];
}

export const isRange = (table: Table): boolean => table.key === 'range';

export const isNumberKeyed = (table: Table | undefined): boolean => table?.key === 'number' || table?.key === 'range';

export const linkOf = (column: { kind?: string; from?: string } | undefined): string | undefined =>
  (column?.from && (column.kind === 'choice' || column.kind === 'number') ? column.from : undefined);

export function rowByKey(table: Table | undefined, key: unknown): TableRow | undefined {
  if (!table || key === null || key === undefined || key === '') return undefined;
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
