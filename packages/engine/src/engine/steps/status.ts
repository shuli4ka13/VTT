import { EngineError } from '../errors.ts';
import type { StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'status';
const words: StepWords = STEP_WORDS.status;
export const { label, hint, slots, outputs } = words;

export const MODES = {
  apply: { label: 'Наложить' },
  remove: { label: 'Снять' },
};

export const mayBreak = false;

export const icon = '☄';

export function traceLine(t: any, h: any) {
  if (t.effect === null) return 'состояние: не задано — шаг пропущен';
  return t.mode === 'remove'
    ? `состояние: снято «${h.effectLabel(t.effect)}»`
    : `состояние: наложено «${h.effectLabel(t.effect)}»`;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const mode = String(step.mode || 'apply');
    if (!(mode in MODES)) throw new EngineError(`${who(ctx)}: у шага «состояние» нет режима «${mode}»; умею ${Object.keys(MODES).join(', ')}`);
    const id = ctx.value(step.effect);
    if (id === null || id === undefined || id === '') return { value: null, trace: { mode, effect: null }, break: null };
    if (typeof id !== 'string') throw new EngineError(`${who(ctx)}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
    const carry = mode === 'apply' ? ctx.optional(step.carry, 'число, которое запомнит наложенное') : null;
    if (mode === 'remove') ctx.detach(id);
    else ctx.attach(id, carry === null ? undefined : carry);
    return { value: id, trace: { mode, effect: id, ...(carry === null ? {} : { carry }) }, break: null };
  },
};


export const { finish } = runner;
