import type { System, Effect, Table, Column, Step as EffectStep } from '@vtt/schema';
import { lintSystem, flattenSystem, armsOf, flowOf, fieldsOf, compile, blockLabel } from '@vtt/engine';
import type { Field } from '@vtt/engine';
import type { Anchor, View } from './types.ts';

export const same = (a: unknown, b: string): boolean =>
  typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

export const fieldBy = (system: System, label: string): Field | undefined =>
  fieldsOf(system).find(field => !field.cell && same(field.label, label));

export const inBlock = (system: System, field: Field | undefined, title: string): boolean =>
  Boolean(field?.placements?.some(place => same(blockLabel(system, place.group), title)));

export const columnOf = (system: System, field: Field | undefined): Column | undefined =>
  field ? system.tables?.[field.home]?.columns?.find(column => column.key === field.tag) : undefined;

export const effectBy = (system: System, label: string): [string, Effect] | undefined =>
  Object.entries(system.effects ?? {}).find(([, effect]) => same(effect.label, label));

export const tableBy = (system: System, label: string): [string, Table] | undefined =>
  Object.entries(system.tables ?? {}).find(([, table]) => same(table.label, label));

export const rowIs = (row: { value?: unknown; label?: unknown } | undefined, word: string): boolean =>
  same(row?.label, word) || same(row?.value, word);

export const columnBy = (table: Table | undefined, label: string): Column | undefined =>
  (table?.columns ?? []).find(column => same(column.label, label));

export const actorKey = (effect: Effect | undefined): string =>
  effect?.params?.find(param => param.kind === 'sheet' && !param.many)?.key ?? 'deystvuyuschiy';

export const aimKey = (effect: Effect | undefined): string =>
  effect?.params?.find(param => param.kind === 'sheet' && param.many)?.item?.key ?? 'cel';

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

const squash = (text: string): string => text.replace(/\s+/g, '');

export const is = (value: unknown, ref: string): boolean => squash(exprOf(value)) === squash(ref);

export const figure = (value: unknown, vars: Record<string, unknown>): unknown => {
  try { return compile(exprOf(value)).evaluate(path => vars[path]); } catch { return undefined; }
};

export const FORMULA_DONE: Anchor = { guide: 'formula-done' };

export const barOpen = (view: View): boolean => view.bar !== undefined && view.bar !== null;

export const barText = (view: View): string => view.bar ?? '';

export const subtracts = (step: Record<string, unknown>): boolean => step.direction === undefined || step.direction === 'subtract';

export const adds = (step: Record<string, unknown>): boolean => step.direction === 'add';

export const isStep = (step: EffectStep | Record<string, unknown>, type: string): boolean =>
  (step as { type?: unknown }).type === type;

export const isArm = (step: { type?: unknown }): boolean => {
  const flow = flowOf(step.type);
  return flow === 'open' || flow === 'alt';
};

export function armOf(steps: Record<string, unknown>[], branch: number): Record<string, unknown>[] {
  const head = steps[branch];
  if (!head) return [];
  const arms = armsOf(steps);
  const own = arms[branch] ?? [];
  const arm = flowOf(head.type) === 'alt' ? own[own.length - 1] : { open: branch, arm: 0 };
  if (!arm) return [];
  return steps.filter((_, k) => k > branch && (arms[k] ?? []).some(one => one.open === arm.open && one.arm === arm.arm));
}

export const errorsOf = (system: System): number =>
  lintSystem(flattenSystem(system, true)).filter(problem => problem.level === 'error').length;
