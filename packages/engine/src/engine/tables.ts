import { TableError } from './errors.ts';
import type { System, RangeTable } from '../model/types.ts';

const need = (system: System, name: string, forTag?: string): RangeTable => {
  const table = system.tables && system.tables[name];
  if (!table) {
    throw new TableError(`система не объявляет таблицу «${name}» (нужна полю «${forTag}»)`);
  }
  return table;
};

export const isCases = (table: RangeTable): boolean => Boolean(table.cases?.length);

export function lookupDegree(
  system: System, tableName: string, input: unknown, shift = 0, forTag?: string,
): unknown {
  const table = need(system, tableName, forTag);
  if (isCases(table)) return lookupTable(system, tableName, input, forTag);

  const rows = [...(table.ranges || [])].sort((a, b) => a.from - b.from);
  if (!rows.length) throw new TableError(`таблица «${tableName}» пуста — степени по ней не прочесть`);

  const n = Number(input);
  let at = rows.findIndex(r => n >= r.from && n <= r.to);
  if (at < 0) at = n < rows[0]!.from ? 0 : rows.length - 1;

  const moved = Math.min(rows.length - 1, Math.max(0, at + shift));
  return rows[moved]!.value;
}

export function lookupTable(
  system: System, tableName: string, input: unknown, forTag?: string,
): unknown {
  const table = need(system, tableName, forTag);

  if (isCases(table)) {
    const same = (a: unknown, b: unknown): boolean =>
      a === b || (a !== null && b !== null && String(a) === String(b));
    const row = (table.cases || []).find(one => same(one.when, input));
    if (row) return row.value;
    if (table.otherwise !== undefined) return table.otherwise;
    throw new TableError(
      `таблица «${tableName}» не знает, что делать с «${String(input)}» — `
      + `есть: ${(table.cases || []).map(one => String(one.when)).join(', ')} (поле «${forTag}»)`);
  }

  const n = Number(input);
  const row = (table.ranges || []).find(r => n >= r.from && n <= r.to);
  if (!row) {
    throw new TableError(
      `значение ${input} не попадает ни в один диапазон таблицы «${tableName}» (поле «${forTag}»)`);
  }
  return row.value;
}
