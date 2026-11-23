import { operate } from './roll-ops.ts';
import { EngineError } from '../errors.ts';
import { LOWEST, ALL, lowestOf } from '../../core/dice.ts';
import type { StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'roll-reroll';
const words: StepWords = STEP_WORDS['roll-reroll'];
export const { label, hint, slots, outputs } = words;
export const seen = true;
export const mayBreak = false;
export const icon = '↻';
export const traceLine = (t: { before: number; after: number; rolls: number[]; which?: string; from?: number; to?: number }): string => {
  if (t.which === ALL) return t.after > t.before ? tr`переброшен весь набор: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}` : tr`переброшен весь набор — прежний не меньше, итог ${t.before}`;
  if (t.which !== LOWEST) return tr`переброшено: [${t.rolls.join(', ')}] — итог ${t.before} → ${t.after}`;
  return t.from === undefined ? tr`перебрасывать нечего — итог ${t.before}` : tr`переброшено ${t.from} → ${t.to} — итог ${t.before} → ${t.after}`;
};

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish: (step, ctx) => {
    const which = step.which;
    if (which === undefined || which === null || which === '') {
      return operate(ctx, tr`Перебросить`, { kind: 'reroll', upTo: ctx.number(step.upTo, tr`до какого значения перебрасывать`) });
    }
    if (which === ALL) {
      const out = operate(ctx, tr`Перебросить`, { kind: 'reroll', which: ALL });
      return { ...out, trace: { ...out.trace, which: ALL } };
    }
    if (which !== LOWEST) throw new EngineError(tr`${ctx.owner || tr`правило`}: «Перебросить» не знает режима «${String(which)}»`);
    const target = ctx.seenRoll ? lowestOf(ctx.seenRoll.value) : null;
    const out = operate(ctx, tr`Перебросить`, { kind: 'reroll', which: LOWEST });
    const now = target ? ctx.seenRoll?.value.dice.find(d => d.id === target.id) : undefined;
    return { ...out, trace: { ...out.trace, which: LOWEST, ...(target ? { from: target.value, to: now?.value ?? target.value } : {}) } };
  },
};


export const { finish } = runner;
