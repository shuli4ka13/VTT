import { EngineError } from '../errors.ts';
import type { StepContext, StepModule, StepData } from './index.ts';
import type { StoredValue, System } from '../../model/types.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { tr, live } from '../../words/tongue.ts';

export const type = 'status';
const words: StepWords = STEP_WORDS.status;
export const { label, hint, slots, outputs } = words;

export const MODES = live({
  apply: { label: 'Наложить' },
  remove: { label: 'Снять' },
});

export const mayBreak = false;

export const slotNames = (step: StepData, slot: string, system: System): readonly string[] =>
  (slot === 'where' && step.by !== 'tag' && typeof step.effect === 'string' ? (system.effects?.[step.effect]?.params ?? []).map(param => param.key) : []);

export const slotRefers = (step: StepData, slot: string): string | null =>
  (slot === 'effect' && step.mode === 'remove' && step.by === 'tag' ? 'tag' : null);

export const icon = '☄';

export function traceLine(t: any, h: any) {
  if (t.effect === null) return tr`состояние: не задано — шаг пропущен`;
  return t.mode === 'remove'
    ? tr`состояние: снято «${h.effectLabel(t.effect)}»`
    : tr`состояние: наложено «${h.effectLabel(t.effect)}»`;
}

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const mode = String(step.mode || 'apply');
    if (!(mode in MODES)) throw new EngineError(tr`${who(ctx)}: у шага «состояние» нет режима «${mode}»; умею ${Object.keys(MODES).join(', ')}`);
    const picked = ctx.value(step.effect);
    const ids = (Array.isArray(picked) ? picked : [picked]).filter(one => one !== null && one !== undefined && one !== '');
    if (!ids.length) return { value: null, trace: { mode, effect: null }, break: null };
    if (ids.length > 1) {
      const traces = ids.map(one => runner.finish({ ...step, effect: { expr: JSON.stringify(one) } } as StepData, ctx).trace);
      return { value: ids, trace: { mode, effect: ids[0], effects: ids, parts: traces }, break: null };
    }
    const id = ids[0];
    if (typeof id !== 'string') throw new EngineError(tr`${who(ctx)}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
    const to = ctx.sheet(step.to, tr`на кого`);
    if (!to) throw new EngineError(tr`${who(ctx)}: шагу «состояние» не сказано, на чей лист`);
    if (mode === 'remove' && step.by === 'tag') {
      const tagged = Object.entries(ctx.system.effects ?? {}).filter(([, effect]) => effect.tags?.includes(id)).map(([key]) => key);
      if (!tagged.length) throw new EngineError(tr`${who(ctx)}: снять эффекты с меткой «${id}» — ни у одного эффекта нет такой метки`);
      const sheet = ctx.sheet(step.to, tr`с кого`);
      if (!sheet) throw new EngineError(tr`${who(ctx)}: шагу «состояние» не сказано, с чьего листа`);
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
        throw new EngineError(tr`${who(ctx)}: наложенное запоминает число, строку или лист, а «${key}» дал ${JSON.stringify(value)}`);
      }
      given[key] = value;
    }
    const args = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== '')) as Record<string, StoredValue>;
    ctx.attach(to, id, args, step.unbound === true);
    return { value: id, trace: { mode, effect: id, sheet: to, ...(Object.keys(args).length ? { args } : {}) }, break: null };
  },
};


export const { finish } = runner;
