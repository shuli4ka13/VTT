import { compile } from '@vtt/engine/formula';
import type { Step } from '@vtt/schema';

export type CardKind = 'check' | 'change' | 'number' | 'split' | 'seen' | 'unknown';

export interface CardGroup {
  kind: CardKind;

  indices: number[];

  step: Step;

  amount: Step | null;
}

const KIND_OF: Record<string, CardKind> = {
  check: 'check', apply: 'change', status: 'change', emit: 'change',
  roll: 'number', table: 'number', each: 'split',
  'roll-add': 'seen', 'roll-reroll': 'seen', 'roll-plus': 'seen',
};

const depsOf = (source: string): readonly string[] => {
  try { return compile(source).deps; } catch { return []; }
};

const loneName = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || !('expr' in value)) return null;
  return /^\s*@([\p{L}\p{N}_.]+)\s*$/u.exec(String((value as { expr: unknown }).expr))?.[1] ?? null;
};

const readsStep = (source: string, id: string): boolean =>
  depsOf(source).some(dep => dep === id || dep.startsWith(`${id}.`));

const walk = (node: unknown, seen: (value: object) => boolean): boolean => {
  if (!node || typeof node !== 'object') return false;
  if (seen(node)) return true;
  const values = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
  return values.some(value => walk(value, seen));
};

export const mentions = (step: Step, id: string): boolean =>
  walk(step, node => {
    const expr = (node as { expr?: unknown }).expr;
    return typeof expr === 'string' && readsStep(expr, id);
  });

const takesWhole = (value: unknown, id: string): boolean => loneName(value) === id;

const names = (step: Step, id: string): boolean =>
  walk(step, node => {
    const expr = (node as { expr?: unknown }).expr;
    return typeof expr === 'string' && depsOf(expr).includes(id);
  });

export function groupSteps(list: Step[]): CardGroup[] {
  const out: CardGroup[] = [];
  for (let i = 0; i < list.length; i++) {
    const step = list[i]!;
    const next = list[i + 1];
    const source = (step as any).source;

    const owned = step.type === 'roll' && (step as { by?: unknown }).by !== undefined;
    if (owned && step.id && next?.type === 'check' && takesWhole((next as { value?: unknown }).value, step.id)
      && list.every((other, j) => j === i || j === i + 1 || !mentions(other, step.id!))) {
      out.push({ kind: 'check', indices: [i, i + 1], step: next, amount: step });
      i++;
      continue;
    }
    const call = next as { args?: Record<string, unknown>; value?: unknown } | undefined;
    const carried = next?.type === 'emit'
      ? Object.values(call?.args ?? {}).find(arg => takesWhole(arg, step.id ?? ''))
      : call?.value;
    const glue = step.type === 'roll' && !owned && step.id
      && (next?.type === 'apply' || next?.type === 'status')
      && source === undefined
      && (takesWhole(carried, step.id) || names(next!, step.id))
      && list.every((other, j) => j === i || j === i + 1 || !mentions(other, step.id!));
    if (glue) {
      out.push({ kind: 'change', indices: [i, i + 1], step: next!, amount: step });
      i++;
      continue;
    }
    out.push({ kind: KIND_OF[step.type] ?? 'unknown', indices: [i], step, amount: null });
  }
  return out;
}

export { BRICKS, SEEN_BRICKS } from './factory.ts';
export type { StepTemplate } from './factory.ts';

export function moveGroup(steps: Step[], groupIndex: number, delta: -1 | 1): Step[] {
  const groups = groupSteps(steps);
  const here = groups[groupIndex];
  const there = groups[groupIndex + delta];
  if (!here || !there) return steps;

  const slice = (g: CardGroup) => g.indices.map(i => steps[i]!);
  const [first, second] = delta === -1 ? [there, here] : [here, there];
  const head = steps.slice(0, first.indices[0]!);
  const tail = steps.slice(second.indices[second.indices.length - 1]! + 1);
  return [...head, ...slice(second), ...slice(first), ...tail];
}

export interface Removal { steps: Step[]; cleared: { step: number; slot: string }[] }

export function removeSteps(steps: Step[], indices: number[]): Removal {
  const gone = new Set(indices);
  const ids = new Set(steps.filter((_, i) => gone.has(i)).map(s => s.id).filter((id): id is string => Boolean(id)));
  const kept = steps.filter((_, i) => !gone.has(i)).map(step => structuredClone(step));
  const cleared: Removal['cleared'] = [];
  if (!ids.size) return { steps: kept, cleared };
  const isExpr = (value: unknown): value is { expr: unknown } =>
    Boolean(value) && typeof value === 'object' && 'expr' in (value as object);
  const sweep = (node: Record<string, unknown>, at: number, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const slot = prefix ? `${prefix}.${key}` : key;
      if (isExpr(value)) {
        const expr = String(value.expr ?? '');
        if (![...ids].some(id => readsStep(expr, id))) continue;
        const lone = loneName(value);
        if (key === 'when' || (lone && ids.has(lone.split('.')[0]!))) {
          delete node[key];
          cleared.push({ step: at, slot: key === 'when' ? 'выполнять' : slot });
        } else {
          cleared.push({ step: at, slot: `${slot} (формула)` });
        }
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) sweep(value as Record<string, unknown>, at, slot);
    }
  };
  kept.forEach((step, at) => sweep(step as Record<string, unknown>, at, ''));
  return { steps: kept, cleared };
}
