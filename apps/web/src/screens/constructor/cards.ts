import type { Step } from '@vtt/schema';

export type CardKind = 'check' | 'change' | 'number' | 'unknown';

export interface CardGroup {
  kind: CardKind;

  indices: number[];

  step: Step;

  amount: Step | null;
}

const KIND_OF: Record<string, CardKind> = {
  threshold: 'check', compare: 'check', apply: 'change', status: 'change', emit: 'change', amount: 'number',
};

const mentions = (step: Step, id: string): boolean => {
  const text = JSON.stringify(step);
  if (text.includes(`"ref":"${id}"`) || text.includes(`"ref":"${id}.`)) return true;
  return names(step, id);
};

const takesWhole = (value: unknown, id: string): boolean =>
  !!value && typeof value === 'object' && (value as Record<string, unknown>).ref === id;

const names = (step: Step, id: string): boolean =>
  new RegExp(`#${id}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(step));

export function groupSteps(list: Step[]): CardGroup[] {
  const out: CardGroup[] = [];
  for (let i = 0; i < list.length; i++) {
    const step = list[i]!;
    const next = list[i + 1];
    const source = (step as any).source;

    const carried = next?.type === 'emit' ? (next as any).amount : (next as any)?.value;
    const glue = step.type === 'amount' && step.id
      && (next?.type === 'apply' || next?.type === 'status' || next?.type === 'emit')
      && (source === 'roll' || source === undefined)
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

export { BRICKS } from './factory.ts';
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
