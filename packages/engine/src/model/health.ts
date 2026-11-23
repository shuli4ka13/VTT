import { calc, newPass, wornCount } from '../engine/calc.ts';
import { rowKeyOf } from './sheet-columns.ts';
import type { System, Sheet, Compendium, TableRow } from './types.ts';

export type HealthSpec = NonNullable<System['health']>;

export interface HealthStep {
  key: string;
  label: string;
  at: number;
}

export interface Health {
  value: number | null;
  max: number | null;
  share: number | null;
  step: HealthStep | null;
}

export interface HealthOptions {
  compendium?: Compendium;
  shared?: readonly Sheet[] | null;
}

export const healthSpec = (system: System): HealthSpec | null => system.health ?? null;

const numberOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const shareOf = (value: number | null, max: number | null): number | null =>
  (value === null || max === null || max <= 0 ? null : Math.max(0, Math.floor((value / max) * 100)));

export function healthSteps(system: System): { row: TableRow; step: HealthStep; from: number | null; state: string | null }[] {
  const steps = healthSpec(system)?.steps;
  const table = steps ? system.tables?.[steps.table] : undefined;
  if (!steps || !table) return [];
  return (table.rows ?? []).map((row, at) => {
    const state = steps.state ? row.cells?.[steps.state] : undefined;
    return {
      row,
      step: { key: rowKeyOf(row), label: row.label ?? String(row.value ?? ''), at },
      from: numberOf(row.cells?.[steps.from]),
      state: typeof state === 'string' && state ? state : null,
    };
  });
}

export function healthOf(system: System, sheet: Sheet, options: HealthOptions = {}): Health | null {
  const spec = healthSpec(system);
  if (!spec) return null;
  const pass = newPass(system, sheet, { ...(options.compendium ? { compendium: options.compendium } : {}), shared: options.shared ?? null });
  const read = (tag: string): number | null => {
    try { return numberOf(calc(system, sheet, tag, pass)); } catch { return null; }
  };
  const value = read(spec.value);
  const max = read(spec.max);
  const share = shareOf(value, max);
  const found = healthSteps(system).find(one => (one.state
    ? wornCount(system, sheet, one.state, options.compendium ?? null) > 0
    : share !== null && one.from !== null && share >= one.from));
  return { value, max, share, step: found?.step ?? null };
}
