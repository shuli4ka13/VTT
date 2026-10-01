import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { packed, operate, numberOf } from './roll-ops.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'roll-plus';
const words: StepWords = STEP_WORDS['roll-plus'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '+';
export const traceLine = (t: { before: number; after: number }): string => `прибавлено — итог ${t.before} → ${t.after}`;

export const pack = packed(['value']);

export function resolve(step: StepData, ctx: StepContext) {
  return operate(ctx, label, { kind: 'plus', value: numberOf(step.value, ctx, 'сколько прибавить') });
}
