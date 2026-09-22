import { TableError } from './errors.ts';
import { VALUE_COLUMN, isRange, rowsOf, cellOf, tableOf } from '../model/tables.ts';
import type { System, Table, TableRow } from '../model/types.ts';

const need = (system: System, name: string, forTag?: string): Table => {
  const table = tableOf(system, name);
  if (!table) {
    throw new TableError(`система не объявляет таблицу «${name}» (нужна полю «${forTag}»)`);
  }
  return table;
};

export const isCases = (table: Table): boolean => !isRange(table);

const same = (a: unknown, b: unknown): boolean =>
  a === b || (a !== null && b !== null && String(a) === String(b));

const byRange = (table: Table): TableRow[] =>
  [...rowsOf(table)].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));

export function rowOf(system: System, tableName: string, input: unknown, forTag?: string): TableRow | undefined {
  const table = need(system, tableName, forTag);
  if (isRange(table)) {
    const n = Number(input);
    return rowsOf(table).find(r => n >= (r.from ?? -Infinity) && n <= (r.to ?? Infinity));
  }
  return rowsOf(table).find(r => same(r.value, input));
}

export function lookupCell(
  system: System, tableName: string, input: unknown, column: string, forTag?: string,
): unknown {
  const table = need(system, tableName, forTag);
  const row = rowOf(system, tableName, input, forTag);
  if (row) return cellOf(row, column);
  if (table.otherwise !== undefined) return table.otherwise;
  if (isRange(table)) {
    throw new TableError(
      `значение ${input} не попадает ни в один диапазон таблицы «${tableName}» (поле «${forTag}»)`);
  }
  throw new TableError(
    `таблица «${tableName}» не знает, что делать с «${String(input)}» — `
    + `есть: ${rowsOf(table).map(one => String(one.value)).join(', ')} (поле «${forTag}»)`);
}

export function lookupTable(
  system: System, tableName: string, input: unknown, forTag?: string,
): unknown {
  return lookupCell(system, tableName, input, VALUE_COLUMN, forTag);
}

export function lookupDegree(
  system: System, tableName: string, input: unknown, shift = 0, forTag?: string,
): unknown {
  const table = need(system, tableName, forTag);
  if (!isRange(table)) return lookupTable(system, tableName, input, forTag);

  const rows = byRange(table);
  if (!rows.length) throw new TableError(`таблица «${tableName}» пуста — степени по ней не прочесть`);

  const n = Number(input);
  let at = rows.findIndex(r => n >= (r.from ?? -Infinity) && n <= (r.to ?? Infinity));
  if (at < 0) at = n < (rows[0]!.from ?? 0) ? 0 : rows.length - 1;

  const moved = Math.min(rows.length - 1, Math.max(0, at + shift));
  return cellOf(rows[moved], VALUE_COLUMN);
}
