import type { System, Table, TableRow } from './types.ts';

type Loose = Record<string, unknown>;

export const VALUE_COLUMN = 'value';

const isOld = (table: Loose): boolean =>
  Array.isArray(table.values) || Array.isArray(table.ranges) || Array.isArray(table.cases);

const kindOfCell = (cell: unknown): 'number' | 'text' | 'expr' =>
  (typeof cell === 'number' ? 'number'
    : typeof cell === 'string' && /[@#()+\-*/<>?]/.test(cell) ? 'expr' : 'text');

function fromOld(old: Loose): Table {
  const label = old.label as string | undefined;
  if (Array.isArray(old.values)) {
    return {
      ...(label ? { label } : {}),
      key: 'word',
      ...(old.of ? { of: old.of as 'number' | 'text' } : {}),
      rows: (old.values as Loose[]).map(v => ({ value: v.value as never, label: String(v.label ?? v.value) })),
    };
  }
  if (Array.isArray(old.ranges)) {
    const rows = old.ranges as Loose[];
    return {
      ...(label ? { label } : {}),
      key: 'range',
      columns: [{ key: VALUE_COLUMN, label: 'значение', kind: 'number' }],
      rows: rows.map(r => ({ from: Number(r.from), to: Number(r.to), cells: { [VALUE_COLUMN]: r.value } })),
    };
  }
  const cases = (old.cases ?? []) as Loose[];
  const kinds = new Set(cases.map(c => kindOfCell(c.value)));
  const kind = kinds.size === 1 ? [...kinds][0]! : 'expr';
  return {
    ...(label ? { label } : {}),
    key: 'word',
    columns: [{ key: VALUE_COLUMN, label: 'значение', kind }],
    rows: cases.map(c => ({ value: c.when as never, cells: { [VALUE_COLUMN]: c.value } })),
    ...(old.otherwise !== undefined ? { otherwise: old.otherwise as never } : {}),
  };
}

export function unifyTables(system: System): System {
  const source = system as unknown as Loose;
  const lists = (source.lists ?? {}) as Record<string, Loose>;
  const tables = (source.tables ?? {}) as Record<string, Loose>;
  const stale = Object.keys(lists).length > 0 || Object.values(tables).some(isOld);
  if (!stale) return system;

  const next: Record<string, Table> = {};
  for (const [key, table] of Object.entries(tables)) next[key] = isOld(table) ? fromOld(table) : (table as Table);
  for (const [key, list] of Object.entries(lists)) {
    if (next[key]) continue;
    next[key] = fromOld(list);
  }
  const out: Loose = { ...source, tables: next };
  delete out.lists;
  return out as unknown as System;
}

export function tableOf(system: System, key: string | undefined): Table | undefined {
  if (!key) return undefined;
  return system.tables?.[key];
}

export const isRange = (table: Table): boolean => table.key === 'range';

export const rowsOf = (table: Table | undefined): TableRow[] => table?.rows ?? [];

export const columnsOf = (table: Table | undefined) => table?.columns ?? [];

export const cellOf = (row: TableRow | undefined, column: string): unknown =>
  (row?.cells ?? {})[column];

export const isWordTable = (table: Table): boolean => !isRange(table);

export function choiceTables(system: System): [string, Table][] {
  return Object.entries(system.tables ?? {}).filter(([, table]) => isWordTable(table));
}
