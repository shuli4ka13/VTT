// Поиск по таблице диапазонов.
//
// Бонус мастерства в 5e — ступенька по уровню, а не арифметика. Выводить его
// формулой значит зашить в систему допущение конкретной редакции. Таблица —
// данные того же рода, что и формула: система её объявляет, движок применяет.

import { TableError } from './errors.js';

export function lookupTable(system, tableName, input, forTag) {
  const table = system.tables && system.tables[tableName];
  if (!table) {
    throw new TableError(`система не объявляет таблицу «${tableName}» (нужна полю «${forTag}»)`);
  }
  const row = (table.ranges || []).find(r => input >= r.from && input <= r.to);
  if (!row) {
    throw new TableError(
      `значение ${input} не попадает ни в один диапазон таблицы «${tableName}» (поле «${forTag}»)`);
  }
  return row.value;
}
