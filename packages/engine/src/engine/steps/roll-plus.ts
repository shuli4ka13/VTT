import { operate } from './roll-ops.ts';
import { DIE_LETTER } from '../../words/glossary.ts';
import type { Die } from '../../model/types.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'roll-plus';
const words: StepWords = STEP_WORDS['roll-plus'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '+';
export const traceLine = (t: { before: number; after: number; addend?: { dice?: { sides: number; value: number }[] } }): string => {
  const dice = t.addend?.dice ?? [];
  const what = dice.length ? ` ${dice.map(d => `${DIE_LETTER}${d.sides}: ${d.value}`).join(', ')}` : '';
  return `прибавлено${what} — итог ${t.before} → ${t.after}`;
};

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const dice: { sides: number; value: number }[] = [];
    const watched: Die = sides => {
      const value = ctx.die(sides);
      dice.push({ sides, value });
      return value;
    };
    const value = ctx.using(watched).number(step.value, 'сколько прибавить');
    return operate(ctx, 'Прибавить', { kind: 'plus', addend: { label: ctx.label, value, dice } });
  },
};


export const { finish } = runner;
