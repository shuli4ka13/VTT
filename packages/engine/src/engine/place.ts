import { rowsOf, tableOf } from '../model/tables.ts';
import type { System, Param } from '../model/types.ts';

export interface Place { x: number; y: number }

export type Places = Record<string, Place>;

export type Diagonal = 'one' | 'alt' | 'line';

export function cellsBetween(a: Place, b: Place, diagonal: Diagonal = 'one'): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const long = Math.max(dx, dy);
  const short = Math.min(dx, dy);
  if (diagonal === 'alt') return long + Math.floor(short / 2);
  if (diagonal === 'line') return Math.ceil(Math.hypot(dx, dy));
  return long;
}

export function distanceOf(system: System, places: Places | undefined, from: string, to: string): number | null {
  const grid = system.grid;
  const a = places?.[from];
  const b = places?.[to];
  if (!grid || !a || !b) return null;
  return cellsBetween(a, b, grid.diagonal) * grid.step;
}

const boundColumn = (system: System, key: string, bound: 'from' | 'to'): string | undefined =>
  tableOf(system, key)?.columns?.find(column => column.bound === bound)?.key;

export const hasBands = (system: System, key: string | undefined): boolean =>
  Boolean(key && (boundColumn(system, key, 'from') || boundColumn(system, key, 'to')));

export function bandOf(system: System, key: string | undefined, amount: number): string | null {
  if (!key || !hasBands(system, key)) return null;
  const low = boundColumn(system, key, 'from');
  const high = boundColumn(system, key, 'to');
  const edge = (cells: Record<string, unknown> | undefined, column: string | undefined, none: number): number => {
    const value = column ? cells?.[column] : undefined;
    return typeof value === 'number' ? value : none;
  };
  const row = rowsOf(tableOf(system, key)).find(one =>
    one.value !== undefined
    && amount >= edge(one.cells, low, Number.NEGATIVE_INFINITY)
    && amount <= edge(one.cells, high, Number.POSITIVE_INFINITY));
  return row ? String(row.value) : null;
}

export function measuredValue(system: System, param: Param, distance: number): string | number | null {
  if (!param.measure) return null;
  if (param.kind === 'choice') return bandOf(system, param.from, distance);
  if (param.kind === undefined || param.kind === 'number') return distance;
  return null;
}

export function distanceWords(system: System, distance: number): string {
  const unit = system.grid?.unit;
  return unit ? `${distance} ${unit}` : String(distance);
}
