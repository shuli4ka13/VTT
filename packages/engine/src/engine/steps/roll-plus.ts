import { operate } from './roll-ops.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'roll-plus';
const words: StepWords = STEP_WORDS['roll-plus'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '+';
export const traceLine = (t: { before: number; after: number }): string => `прибавлено — итог ${t.before} → ${t.after}`;

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish: (step, ctx) => operate(ctx, 'Прибавить', { kind: 'plus', value: ctx.number(step.value, 'сколько прибавить') }),
};


export const { finish } = runner;
