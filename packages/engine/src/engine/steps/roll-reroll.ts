import { operate } from './roll-ops.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'roll-reroll';
const words: StepWords = STEP_WORDS['roll-reroll'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '↻';
export const traceLine = (t: { before: number; after: number; rolls: number[] }): string =>
  `переброшено: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}`;

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish: (step, ctx) => operate(ctx, 'Перебросить', { kind: 'reroll', upTo: ctx.number(step.upTo, 'до какого значения перебрасывать') }),
};


export const { finish } = runner;
