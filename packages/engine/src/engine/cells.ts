import { compile } from '../formula/index.ts';
import { applyValueModifiers } from './modifiers.ts';
import { lookupCell, rowOf } from './tables.ts';
import { VALUE_COLUMN, isRange } from '../model/tables.ts';
import { addressOf, cellSource, isLive, withRow } from '../model/sheet-columns.ts';
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
  const row = table && spec ? rowOf(system, tableId, input, forTag) : undefined;
  if (!table || !spec || !row) return lookupCell(system, tableId, input, column, forTag);
  if (isLive(table, spec, row)) return pass.resolve(addressOf(tableId, row, column));
  const source = cellSource(spec, row);
  if (source.kind === 'value') return source.value;
  if (source.kind === 'input') return undefined;

  const base = compile(withRow(system, tableId, row, source.expr)).evaluate(pass.resolve);
  return applyValueModifiers(base, cellTagOf(tableId, rowKeyOf(table, input), column), pass, [columnTagOf(tableId, column)]);
}
