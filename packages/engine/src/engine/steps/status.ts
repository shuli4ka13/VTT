import { EngineError } from '../errors.ts';
import type { StepContext, StepModule } from './index.ts';
import type { StoredValue } from '../../model/types.ts';
import { fillMissing } from '../../model/implicit.ts';
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

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const mode = String(step.mode || 'apply');
    if (!(mode in MODES)) throw new EngineError(`${who(ctx)}: у шага «состояние» нет режима «${mode}»; умею ${Object.keys(MODES).join(', ')}`);
    const id = ctx.value(step.effect);
    if (id === null || id === undefined || id === '') return { value: null, trace: { mode, effect: null }, break: null };
    if (typeof id !== 'string') throw new EngineError(`${who(ctx)}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
    const to = ctx.sheet(step.to, 'на кого');
    if (!to) throw new EngineError(`${who(ctx)}: шагу «состояние» не сказано, на чей лист`);
    if (mode === 'remove') {
      ctx.detach(to, id);
      return { value: id, trace: { mode, effect: id, sheet: to }, break: null };
    }
    const given: Record<string, StoredValue> = {};
    for (const [key, ref] of Object.entries((step.args ?? {}) as Record<string, unknown>)) {
      const value = ctx.value(ref);
      if (value === null || value === undefined) continue;
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new EngineError(`${who(ctx)}: наложенное запоминает число, строку или лист, а «${key}» дал ${JSON.stringify(value)}`);
      }
      given[key] = value;
    }
    const filled = fillMissing(ctx.system.effects?.[id]?.params ?? [], given, { prop: name => ctx.prop(name), implicit: param => ctx.implicit(param, to) }, true);
    const args = Object.fromEntries(Object.entries(filled).filter(([, value]) => value !== '')) as Record<string, StoredValue>;
    ctx.attach(to, id, args);
    return { value: id, trace: { mode, effect: id, sheet: to, ...(Object.keys(args).length ? { args } : {}) }, break: null };
  },
};


export const { finish } = runner;
