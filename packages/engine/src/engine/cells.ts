import { compile } from '../formula/index.ts';
import type { Tools } from '../formula/index.ts';
import { EngineError } from './errors.ts';
import { diceTools } from '../core/roll.ts';
import { applyValueModifiers } from './modifiers.ts';
import { lookupCell, rowOf } from './tables.ts';
import { VALUE_COLUMN, isRange } from '../model/tables.ts';
import { addressOf, cellSource, hasField, isLive, withRow } from '../model/sheet-columns.ts';
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

export interface Scope { resolve: (name: string) => unknown; tools: Tools; seen: Set<string>; owns?: (head: string) => boolean }

const onSheet = (system: System, name: string): boolean => {
  const head = name.split('.')[0]!;
  return hasField(system, name) || hasField(system, head) || Boolean(system.tables?.[head]) || Boolean(system.constants?.[head]);
};

export function readCell(
  system: System, pass: Pass, tableId: string, input: unknown, column = VALUE_COLUMN, forTag?: string, scope?: Scope,
): unknown {
  const table = system.tables?.[tableId];
  const spec = (table?.columns ?? []).find(c => c.key === column);
  const row = table && spec ? rowOf(system, tableId, input, forTag) : undefined;
  if (!table || !spec || !row) return lookupCell(system, tableId, input, column, forTag);
  if (isLive(table, spec, row)) return pass.resolve(addressOf(tableId, row, column));
  const source = cellSource(spec, row);
  if (source.kind === 'value') return source.value;
  if (source.kind === 'input') return spec.default;

  const tag = cellTagOf(tableId, rowKeyOf(table, input), column);
  const formula = compile(withRow(system, tableId, row, source.expr));
  if (!scope) return applyValueModifiers(formula.evaluate(pass.resolve, diceTools()), tag, pass, [columnTagOf(tableId, column)]);
  if (scope.seen.has(tag)) {
    throw new EngineError(`клетка «${table.label || tableId}» → «${rowKeyOf(table, input)}» → «${spec.label ?? column}» читает сама себя по кругу`);
  }
  scope.seen.add(tag);
  try {
    const base = formula.evaluate(name => (!scope.owns?.(name.split('.')[0]!) && onSheet(system, name) ? pass.resolve(name) : scope.resolve(name)), scope.tools);
    return applyValueModifiers(base, tag, pass, [columnTagOf(tableId, column)]);
  } finally {
    scope.seen.delete(tag);
  }
}
