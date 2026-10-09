import { compile } from '@vtt/engine/formula';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import type { Step } from '@vtt/schema';
import { armsOf, balance, endOf, flowOf, inBlock } from '@vtt/engine/model/flow';

export type CardKind = 'check' | 'change' | 'number' | 'table' | 'split' | 'seen' | 'flow' | 'stop' | 'unknown';

export interface CardGroup {
  kind: CardKind;

  indices: number[];

  step: Step;

  amount: Step | null;
}

const KIND_OF: Record<string, CardKind> = {
  check: 'check', apply: 'change', status: 'change', emit: 'change',
  roll: 'number', table: 'table', each: 'split',
  'roll-add': 'seen', 'roll-reroll': 'seen', 'roll-plus': 'seen',
  branch: 'flow', orElse: 'flow', end: 'flow', stop: 'stop',
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

    const owned = step.type === 'roll' && (step as { by?: unknown }).by !== undefined;
    if (owned && step.id && next?.type === 'check' && takesWhole((next as { value?: unknown }).value, step.id)) {
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

type Atom = [number, number];

function atomsOf(steps: Step[]): Atom[] {
  const out: Atom[] = [];
  const groups = groupSteps(steps);
  for (let g = 0; g < groups.length; g++) {
    const first = groups[g]!.indices[0]!;
    const last = groups[g]!.indices[groups[g]!.indices.length - 1]!;
    out.push([first, last]);
  }
  return out;
}

export const validFlow = (steps: Step[]): boolean => {
  if (balance(steps).length) return false;
  const arms = armsOf(steps);
  return !steps.some((step, index) => step.type === 'each' && inBlock(arms, index));
};

function swap(steps: Step[], a: Atom, b: Atom): Step[] {
  const [first, second] = a[0] < b[0] ? [a, b] : [b, a];
  return [
    ...steps.slice(0, first[0]),
    ...steps.slice(second[0], second[1] + 1),
    ...steps.slice(first[1] + 1, second[0]),
    ...steps.slice(first[0], first[1] + 1),
    ...steps.slice(second[1] + 1),
  ];
}

function neighbour(steps: Step[], atoms: Atom[], here: Atom, delta: -1 | 1, whole: boolean): Atom | null {
  const at = atoms.findIndex(atom => atom[0] === here[0]);
  const next = atoms[at + delta];
  if (!next || !whole) return next ?? null;
  if (delta === -1 && flowOf(steps[next[0]]!.type) === 'close') {
    let depth = 0;
    for (let i = next[0]; i >= 0; i--) {
      const flow = flowOf(steps[i]!.type);
      if (flow === 'close') depth++;
      if (flow === 'open' && --depth === 0) return [i, next[0]];
    }
  }
  if (delta === 1 && flowOf(steps[next[0]]!.type) === 'open') return [next[0], endOf(steps, next[0])];
  return next;
}

export function moveSpan(steps: Step[], span: Atom, delta: -1 | 1, whole = false): Step[] {
  const atoms = atomsOf(steps).filter(atom => atom[0] < span[0] || atom[0] > span[1]);
  const merged = [...atoms, span].sort((a, b) => a[0] - b[0]);
  for (const jump of whole ? [true] : [false, true]) {
    const other = neighbour(steps, merged, span, delta, jump);
    if (!other) return steps;
    const out = swap(steps, span, other);
    if (validFlow(out)) return out;
  }
  return steps;
}

export function moveGroup(steps: Step[], groupIndex: number, delta: -1 | 1): Step[] {
  const group = groupSteps(steps)[groupIndex];
  if (!group) return steps;
  return moveSpan(steps, [group.indices[0]!, group.indices[group.indices.length - 1]!], delta);
}

export const blockSpan = (steps: Step[], open: number): Atom => [open, endOf(steps, open)];

export function armEnd(steps: Step[], head: number): number {
  let depth = 0;
  for (let i = head + 1; i < steps.length; i++) {
    const flow = flowOf(steps[i]!.type);
    if (flow === 'open') depth++;
    else if (flow === 'close') { if (depth === 0) return i; depth--; }
    else if (flow === 'alt' && depth === 0) return i;
  }
  return steps.length;
}

export function wrapInBranch(steps: Step[], first: number, last: number, condition?: string): Step[] {
  const head = { type: 'branch', ...(condition ? { if: { expr: condition } } : {}) } as unknown as Step;
  return [...steps.slice(0, first), head, ...steps.slice(first, last + 1), { type: 'end' } as unknown as Step, ...steps.slice(last + 1)];
}

export function addArm(steps: Step[], open: number, withCondition: boolean): Step[] {
  const end = endOf(steps, open);
  const arm = { type: 'orElse', ...(withCondition ? { if: { expr: '' } } : {}) } as unknown as Step;
  const lastBare = steps.slice(open, end).some((step, k) => flowOf(step.type) === 'alt' && armDepth(steps, open, open + k) && (step as { if?: unknown }).if === undefined);
  if (lastBare && withCondition) {
    const bare = steps.findIndex((step, i) => i > open && i < end && flowOf(step.type) === 'alt' && armDepth(steps, open, i) && (step as { if?: unknown }).if === undefined);
    return [...steps.slice(0, bare), arm, ...steps.slice(bare)];
  }
  return [...steps.slice(0, end), arm, ...steps.slice(end)];
}

function armDepth(steps: Step[], open: number, at: number): boolean {
  let depth = 0;
  for (let i = open + 1; i < at; i++) {
    const flow = flowOf(steps[i]!.type);
    if (flow === 'open') depth++;
    if (flow === 'close') depth--;
  }
  return depth === 0;
}

export function dropArm(steps: Step[], head: number): Step[] {
  return [...steps.slice(0, head), ...steps.slice(armEnd(steps, head))];
}

export function unwrapBlock(steps: Step[], open: number): Step[] {
  const end = endOf(steps, open);
  const first = armEnd(steps, open);
  return [...steps.slice(0, open), ...steps.slice(open + 1, first), ...steps.slice(end + 1)];
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
        if (key === 'if' || (lone && ids.has(lone.split('.')[0]!))) {
          delete node[key];
          cleared.push({ step: at, slot: key === 'if' ? 'условие' : slot });
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

export function retype(draft: Step, type: string): void {
  const words = (STEP_WORDS as Record<string, { slots?: readonly { key: string }[] }>)[type];
  const keep = new Set(['id', 'type', ...(words?.slots ?? []).map(slot => slot.key)]);
  (draft as { type: string }).type = type;
  for (const key of Object.keys(draft)) if (!keep.has(key)) delete (draft as Record<string, unknown>)[key];
}

