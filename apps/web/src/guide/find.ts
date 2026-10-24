import type { System, Effect, Table, Column, Step as EffectStep } from '@vtt/schema';
import { lintSystem } from '@vtt/engine/model/lint';
import { flattenSystem } from '@vtt/engine/model/inherit';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import type { Field } from '@vtt/engine/model/types';

export const same = (a: unknown, b: string): boolean =>
  typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

export const fieldBy = (system: System, label: string): Field | undefined =>
  fieldsOf(system).find(field => !field.cell && same(field.label, label));

export const inBlock = (field: Field | undefined, block: string): boolean =>
  Boolean(field?.placements?.some(place => place.group === block));

export const columnOf = (system: System, field: Field | undefined): Column | undefined =>
  field ? system.tables?.[field.home]?.columns?.find(column => column.key === field.tag) : undefined;

export const effectBy = (system: System, label: string): [string, Effect] | undefined =>
  Object.entries(system.effects ?? {}).find(([, effect]) => same(effect.label, label));

export const tableBy = (system: System, label: string): [string, Table] | undefined =>
  Object.entries(system.tables ?? {}).find(([, table]) => same(table.label, label));

export const columnBy = (table: Table | undefined, label: string): Column | undefined =>
  (table?.columns ?? []).find(column => same(column.label, label));

export const stepsOf = (effect: Effect | undefined): Record<string, unknown>[] =>
  (effect?.steps ?? []) as unknown as Record<string, unknown>[];

export const exprOf = (value: unknown): string => {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'expr' in value) return String((value as { expr: unknown }).expr ?? '');
  return '';
};

export const numberOf = (value: unknown): number | undefined => {
  const text = exprOf(value).trim();
  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : undefined;
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const reads = (value: unknown, ref: string): boolean =>
  new RegExp(`${escape(ref)}(?![\\p{L}\\p{N}_])`, 'u').test(exprOf(value));

export const isStep = (step: EffectStep | Record<string, unknown>, type: string): boolean =>
  (step as { type?: unknown }).type === type;

export function armOf(steps: Record<string, unknown>[], branch: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let depth = 0;
  for (const step of steps.slice(branch + 1)) {
    if (step.type === 'branch') depth += 1;
    if (step.type === 'end') { if (depth === 0) break; depth -= 1; }
    if (depth === 0 && step.type === 'orElse') break;
    out.push(step);
  }
  return out;
}

export const errorsOf = (system: System): number =>
  lintSystem(flattenSystem(system, true)).filter(problem => problem.level === 'error').length;
