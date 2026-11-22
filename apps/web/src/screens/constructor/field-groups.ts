import { fieldsOf, NO_BLOCK, sheetBlockNames } from '@vtt/engine';
import type { System } from '@vtt/schema';

export type Grouped = readonly [string, string, string];

export function blockOfColumn(system: System): (table: string, column: string) => string {
  const first = new Map<string, string>();
  for (const field of fieldsOf(system)) {
    const key = `${field.home}\u0000${field.cell ? field.cell.column : field.tag}`;
    const group = field.placements?.[0]?.group;
    if (group && !first.has(key)) first.set(key, group);
  }
  return (table, column) => first.get(`${table}\u0000${column}`) ?? NO_BLOCK;
}

export function byBlock<T extends Grouped>(system: System, options: readonly T[]): T[] {
  const order = [...sheetBlockNames(system), NO_BLOCK];
  const at = (group: string): number => { const found = order.indexOf(group); return found < 0 ? order.length : found; };
  return options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => at(a.option[2]) - at(b.option[2]) || a.index - b.index)
    .map(one => one.option);
}
