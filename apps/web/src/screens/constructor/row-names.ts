import { ROW } from '@vtt/engine/model/sheet-columns';
import type { System } from '@vtt/schema';

export function rowNames(system: System, tableId: string): Map<string, string> {
  const table = system.tables?.[tableId];
  const out = new Map<string, string>([[ROW, 'эта строка']]);
  for (const column of table?.columns ?? []) {
    const name = column.label || column.key;
    out.set(`${ROW}.${column.key}`, name);
    if (column.kind !== 'choice' || !column.from) continue;
    for (const other of system.tables?.[column.from]?.columns ?? []) {
      out.set(`${ROW}.${column.key}.${other.key}`, `${name} · ${other.label || other.key}`);
    }
  }
  return out;
}
