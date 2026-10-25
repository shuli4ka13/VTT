import { EngineError } from '../errors.ts';
import type { StepContext, StepModule, StepData } from './index.ts';
import type { StoredValue } from '../../model/types.ts';
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
    const picked = ctx.value(step.effect);
    const ids = (Array.isArray(picked) ? picked : [picked]).filter(one => one !== null && one !== undefined && one !== '');
    if (!ids.length) return { value: null, trace: { mode, effect: null }, break: null };
    if (ids.length > 1) {
      const traces = ids.map(one => runner.finish({ ...step, effect: { expr: JSON.stringify(one) } } as StepData, ctx).trace);
      return { value: ids, trace: { mode, effect: ids[0], effects: ids, parts: traces }, break: null };
    }
    const id = ids[0];
    if (typeof id !== 'string') throw new EngineError(`${who(ctx)}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
    const to = ctx.sheet(step.to, 'на кого');
    if (!to) throw new EngineError(`${who(ctx)}: шагу «состояние» не сказано, на чей лист`);
    if (mode === 'remove' && !ctx.system.effects?.[id]) {
      const tagged = Object.entries(ctx.system.effects ?? {}).filter(([, effect]) => effect.tags?.includes(id)).map(([key]) => key);
      if (!tagged.length) throw new EngineError(`${who(ctx)}: снять «${id}» — нет ни эффекта, ни метки эффекта с таким именем`);
      const sheet = ctx.sheet(step.to, 'с кого');
      if (!sheet) throw new EngineError(`${who(ctx)}: шагу «состояние» не сказано, с чьего листа`);
      for (const one of tagged) ctx.detach(sheet, one);
      return { value: id, trace: { mode, effect: tagged[0], effects: tagged, sheet }, break: null };
    }
    if (mode === 'remove') {
      const where = step.where === undefined || step.where === null || step.where === '' ? undefined : step.where;
      const one = step.one === true || step.one === 'true';
      ctx.detach(to, id, where === undefined && !one ? undefined : { ...(where !== undefined ? { where } : {}), ...(one ? { one } : {}) });
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
    const args = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== '')) as Record<string, StoredValue>;
    ctx.attach(to, id, args);
    return { value: id, trace: { mode, effect: id, sheet: to, ...(Object.keys(args).length ? { args } : {}) }, break: null };
  },
};


export const { finish } = runner;
