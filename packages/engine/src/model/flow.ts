import { registry } from '../engine/steps/index.ts';
import { compile, printFormula, joinAnd, NOT } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { tr } from '../words/tongue.ts';

export type Flow = 'open' | 'alt' | 'close';

export const flowOf = (type: unknown): Flow | null => registry.get(String(type))?.flow ?? null;

export const isFlow = (step: { type?: unknown } | undefined): boolean => Boolean(step && flowOf(step.type));

export interface Arm { open: number; arm: number }

export function armsOf(steps: readonly { type?: unknown }[]): Arm[][] {
  const out: Arm[][] = [];
  const stack: Arm[] = [];
  steps.forEach((step, index) => {
    const flow = flowOf(step.type);
    if (flow === 'close') { stack.pop(); out.push([...stack]); return; }
    if (flow === 'alt') {
      const top = stack.pop();
      if (top) stack.push({ open: top.open, arm: top.arm + 1 });
      out.push([...stack]);
      return;
    }
    out.push([...stack]);
    if (flow === 'open') stack.push({ open: index, arm: 0 });
  });
  return out;
}

export function sees(arms: readonly Arm[][], from: number, at: number): boolean {
  const mine = arms[at] ?? [];
  const theirs = arms[from] ?? [];
  return !mine.some(own => theirs.some(other => other.open === own.open && other.arm !== own.arm));
}

export const inBlock = (arms: readonly Arm[][], index: number): boolean => (arms[index]?.length ?? 0) > 0;

export function endOf(steps: readonly { type?: unknown }[], open: number): number {
  let depth = 0;
  for (let index = open; index < steps.length; index++) {
    const flow = flowOf(steps[index]!.type);
    if (flow === 'open') depth++;
    if (flow === 'close' && --depth === 0) return index;
  }
  return steps.length - 1;
}

export function balance(steps: readonly { type?: unknown; if?: unknown }[]): { index: number; problem: string }[] {
  const out: { index: number; problem: string }[] = [];
  const stack: { open: number; bare: boolean }[] = [];
  steps.forEach((step, index) => {
    const flow = flowOf(step.type);
    if (flow === 'open') { stack.push({ open: index, bare: false }); return; }
    if (flow === 'alt') {
      const top = stack[stack.length - 1];
      if (!top) out.push({ index, problem: tr`«Иначе» без «Если» выше` });
      else if (top.bare) out.push({ index, problem: tr`«Иначе» после «Иначе» без условия — сюда не дойдёт` });
      else if (step.if === undefined) top.bare = true;
      return;
    }
    if (flow === 'close') {
      if (!stack.pop()) out.push({ index, problem: tr`конец блока без «Если»` });
    }
  });
  for (const left of stack) out.push({ index: left.open, problem: tr`«Если» не закрыт` });
  return out;
}


export function lazyPlan(
  steps: readonly { type?: unknown; if?: unknown }[], lazy: (index: number) => boolean,
): { guards: Map<number, string | null>; hidden: Set<number> } {
  const guards = new Map<number, string | null>();
  const hidden = new Set<number>();
  const condOf = (index: number): Node | null => {
    const raw = steps[index]?.if as { expr?: unknown } | undefined;
    return raw && typeof raw.expr === 'string' && raw.expr.trim() ? compile(raw.expr).ast : null;
  };
  const all = (parts: Node[]): Node | null => joinAnd(parts);
  for (let index = 0; index < steps.length; index++) {
    const flow = flowOf(steps[index]!.type);
    if (!flow) { if (lazy(index)) guards.set(index, null); continue; }
    if (flow !== 'open') continue;
    const end = endOf(steps, index);
    const inside = steps.slice(index, end + 1).map((_, k) => index + k);
    if (!inside.every(at => flowOf(steps[at]!.type) || lazy(at))) { index = end; continue; }
    const frames: { prev: Node[]; cur: Node | null }[] = [];
    const armOf = (frame: { prev: Node[]; cur: Node | null }) =>
      all([...frame.prev.map((operand): Node => ({ kind: 'Unary', op: NOT, operand })), ...(frame.cur ? [frame.cur] : [])]);
    for (const at of inside) {
      const kind = flowOf(steps[at]!.type);
      if (kind === 'open') { frames.push({ prev: [], cur: condOf(at) }); hidden.add(at); continue; }
      if (kind === 'alt') {
        const top = frames[frames.length - 1]!;
        if (top.cur) top.prev.push(top.cur);
        top.cur = condOf(at);
        hidden.add(at);
        continue;
      }
      if (kind === 'close') { frames.pop(); hidden.add(at); continue; }
      const guard = all(frames.map(armOf).filter((g): g is Node => Boolean(g)));
      guards.set(at, guard ? printFormula(guard) : null);
    }
    index = end;
  }
  return { guards, hidden };
}
