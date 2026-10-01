import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { packed, operate, numberOf, optionalNumber } from './roll-ops.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'roll-add';
const words: StepWords = STEP_WORDS['roll-add'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '+🎲';
export const traceLine = (t: { before: number; after: number; rolls: number[] }): string =>
  `докинуто: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}`;

export const pack = packed(['count', 'sides', 'keep', 'explode']);

export function resolve(step: StepData, ctx: StepContext) {
  const keep = step.keep === 'best' || step.keep === 'worst' ? step.keep : undefined;
  const sides = optionalNumber(step.sides, ctx, 'грани докинутой кости');
  return operate(ctx, label, {
    kind: 'add', count: numberOf(step.count, ctx, 'сколько костей докинуть'),
    ...(sides !== null ? { sides } : {}), ...(keep ? { keep } : {}),
    ...(step.explode === true || step.explode === 'true' ? { explode: true } : {}),
  });
}
