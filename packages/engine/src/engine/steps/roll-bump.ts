import { operate } from './roll-ops.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'roll-bump';
const words: StepWords = STEP_WORDS['roll-bump'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '⇡';
export const traceLine = (t: { before: number; after: number }): string => `кость поднята — итог ${t.before} → ${t.after}`;

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const by = step.value === undefined || step.value === null ? 1 : ctx.number(step.value, 'на сколько поднять');
    return operate(ctx, 'Поднять кость', { kind: 'bump', by });
  },
};

export const { finish } = runner;
