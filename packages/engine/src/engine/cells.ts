import { compile } from '../formula/index.ts';
import { applyValueModifiers } from './modifiers.ts';
import { lookupCell, rowOf } from './tables.ts';
import { VALUE_COLUMN, isRange } from '../model/tables.ts';
import { cellTag, withRow } from '../model/sheet-columns.ts';
import type { System, Table } from '../model/types.ts';
import type { Pass } from './calc.ts';

export const CELL_PREFIX = 'cell:';

export const ANY_ROW = '*';

export const cellTagOf = (table: string, row: string, column: string) => `${CELL_PREFIX}${table}.${row}.${column}`;

export const columnTagOf = (table: string, column: string) => cellTagOf(table, ANY_ROW, column);

export function parseCellTag(tag: string): { table: string; row: string; column: string } | null {
  if (!tag.startsWith(CELL_PREFIX)) return null;
  const parts = tag.slice(CELL_PREFIX.length).split('.');
  if (parts.length < 3) return null;
  const column = parts.pop()!;
  const table = parts.shift()!;
  return { table, row: parts.join('.'), column };
}

const rowKeyOf = (table: Table, input: unknown): string => {
  if (isRange(table)) {
    const row = (table.rows ?? []).find(r => Number(input) >= (r.from ?? -Infinity) && Number(input) <= (r.to ?? Infinity));
    return row ? `${row.from}-${row.to}` : String(input);
  }
  return String(input);
};

export function readCell(
  system: System, pass: Pass, tableId: string, input: unknown, column = VALUE_COLUMN, forTag?: string,
): unknown {
  const table = system.tables?.[tableId];
  const spec = (table?.columns ?? []).find(c => c.key === column);
  if (spec?.sheet) {
    const row = rowOf(system, tableId, input, forTag);
    return row ? pass.resolve(cellTag(system, tableId, row, spec)) : null;
  }
  const found = lookupCell(system, tableId, input, column, forTag);
  const raw = spec?.expr ?? found;
  const kind = spec?.kind;
  if (!table || kind !== 'expr' || typeof raw !== 'string') return raw;

  const row = rowOf(system, tableId, input, forTag);
  const base = compile(row ? withRow(system, tableId, row, raw) : raw).evaluate(pass.resolve);
  const key = row ? rowKeyOf(table, input) : String(input);
  const own = applyValueModifiers(base, cellTagOf(tableId, key, column), pass);
  return applyValueModifiers(own, columnTagOf(tableId, column), pass);
}
