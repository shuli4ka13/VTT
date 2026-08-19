import { TableError } from './errors.ts';
import type { System } from '../model/types.ts';

export function lookupDegree(
  system: System, tableName: string, input: unknown, shift = 0, forTag?: string,
): unknown {
  const table = system.tables && system.tables[tableName];
  if (!table) {
    throw new TableError(`система не объявляет таблицу «${tableName}» (нужна полю «${forTag}»)`);
  }
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
  const table = system.tables && system.tables[tableName];
  if (!table) {
    throw new TableError(`система не объявляет таблицу «${tableName}» (нужна полю «${forTag}»)`);
  }
  const n = Number(input);
  const row = (table.ranges || []).find(r => n >= r.from && n <= r.to);
  if (!row) {
    throw new TableError(
      `значение ${input} не попадает ни в один диапазон таблицы «${tableName}» (поле «${forTag}»)`);
  }
  return row.value;
}
