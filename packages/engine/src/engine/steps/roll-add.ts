import { operate } from './roll-ops.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'roll-add';
const words: StepWords = STEP_WORDS['roll-add'];
export const { slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '+🎲';
export const traceLine = (t: { before: number; after: number; rolls: number[] }): string =>
  tr`докинуто: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}`;

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const keep = step.keep === 'best' || step.keep === 'worst' ? step.keep : undefined;
    const sides = ctx.optional(step.sides, tr`грани докинутой кости`);
    return operate(ctx, tr`Докинуть`, {
      kind: 'add', count: ctx.number(step.count, tr`сколько костей докинуть`),
      ...(sides !== null ? { sides } : {}), ...(keep ? { keep } : {}),
      ...(step.explode === true || step.explode === 'true' ? { explode: true } : {}),
    });
  },
};


export const { finish } = runner;
