// Поиск по таблице диапазонов.
//
// Бонус мастерства в 5e — ступенька по уровню, а не арифметика. Выводить его
// формулой значит зашить в систему допущение конкретной редакции. Таблица —
// данные того же рода, что и формула: система её объявляет, движок применяет.

import { TableError } from './errors.ts';
import type { System } from '../model/types.ts';

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
