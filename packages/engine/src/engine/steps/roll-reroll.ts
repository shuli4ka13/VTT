import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { packed, operate, numberOf } from './roll-ops.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'roll-reroll';
const words: StepWords = STEP_WORDS['roll-reroll'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '↻';
export const traceLine = (t: { before: number; after: number; rolls: number[] }): string =>
  `переброшено: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}`;

export const pack = packed(['upTo']);

export function resolve(step: StepData, ctx: StepContext) {
  return operate(ctx, label, { kind: 'reroll', upTo: numberOf(step.upTo, ctx, 'до какого значения перебрасывать') });
}
