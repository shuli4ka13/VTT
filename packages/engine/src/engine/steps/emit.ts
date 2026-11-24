import { EngineError } from '../errors.ts';
import { requireCalled, isPureCall } from '../effects.ts';
import { amountParamOf } from '../../model/lists.ts';
import type { EmittedEvent } from '../rule.ts';
import type { System } from '../../model/types.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { tr } from '../../words/tongue.ts';
import { tagsOf } from './roll.ts';

export const type = 'emit';
const words: StepWords = STEP_WORDS.emit;
export const { slots, outputs } = words;


export function reasonWord(reason: string): string | null {
  return words.reasons[reason] ?? null;
}

export const icon = '➤';

export const idle = (trace: Record<string, unknown>, system: System): boolean => isPureCall(system, trace.event);

export function calls(step: StepData): string | null {
  return typeof step.effect === 'string' ? step.effect : null;
}

export function lint(step: StepData) {
  if (!step.effect) return tr`вызову нужен общий эффект — они живут среди эффектов, в группе «Общие»`;
  return null;
}

const nothing = (): string => tr`не задано — шаг пропущен`;

export function traceLine(t: any, h: any) {
  const name = typeof h?.eventLabel === 'function' ? h.eventLabel(t.event) : t.event;
  const said = (tag: string): string => (typeof h?.tagSaid === 'function' ? h.tagSaid(tag) : tag);
  const tags = t.tags?.length ? ` [${t.tags.map(said).join(', ')}]` : '';
  const mods = t.incoming !== t.amount
    ? tr` (отправлено ${t.incoming}, после правок ${t.amount})`
    : '';
  if (t.event === null) return tr`вызов: ${nothing()}`;
  if (t.bare) return tr`зовёт «${name}»${tags}`;
  return tr`зовёт «${name}»${tags}: ${t.amount}${mods}`;
}

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

function chosenTags(params: { key: string; kind?: string; from?: string }[], args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const param of params) {
    if (param.kind !== 'choice' || !param.from) continue;
    const value = args[param.key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else out.push(String(value));
  }
  return out;
}

function rollArg(ref: unknown, key: string, ctx: StepContext): Record<string, unknown> | null {
  const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : '';
  if (!expr.trim()) return null;
  const name = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(expr)?.[1];
  const roll = name ? ctx.rolled(name) : null;
  if (!roll) throw new EngineError(tr`${who(ctx)}: во вход «${key}» передают бросок — имя шага броска или входа-броска, а не «${expr}»`);
  return roll;
}

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  mayBreak: true,
  finish(step, ctx) {
    const chosen = ctx.value(step.effect);
    if (chosen === null || chosen === undefined || chosen === '') return { value: null, trace: { event: null }, break: null };
    const id = String(chosen);
    const spec = requireCalled(ctx.system, id, who(ctx));
    const params = spec.params ?? [];
    const given: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries((step.args ?? {}) as Record<string, unknown>)) {
      const kind = params.find(p => p.key === key)?.kind;
      const value = kind === 'roll' ? rollArg(ref, key, ctx) : kind === 'field' ? ctx.field(ref) : ctx.value(ref);
      if (value !== null && value !== undefined) given[key] = value;
    }
    const args = given;
    const main = amountParamOf(spec);
    const incoming = main && args[main.key] !== undefined ? Number(args[main.key]) : 0;
    if (!Number.isFinite(incoming)) throw new EngineError(tr`«${main!.label ?? main!.key}» вызова «${spec.label ?? id}»: ждали число, пришло «${String(args[main!.key])}»`);
    const tags = [...new Set([...(spec.tags ?? []), ...chosenTags(params, args), ...tagsOf(step.tags, ctx)])];
    const amountNow = main ? Math.floor(ctx.edited(id, main.key, incoming, tags, args)) : incoming;
    if (main) args[main.key] = amountNow;
    const payload: EmittedEvent = { event: id, amount: amountNow, incoming, tags };
    const out = ctx.call(id, args, payload);
    const received = out.stopped ? String(out.stopped.reason ?? tr`оборвано`) : null;
    const note = out.stopped?.note ?? null;
    return {
      value: { ...payload, ...(out.returns ?? {}) },
      trace: { event: id, incoming, amount: payload.amount, tags: tags.filter(tag => !(spec.tags ?? []).includes(tag)), ...(main ? {} : { bare: true }), ...(received ? { received } : {}) },
      break: ctx.inCost && received ? { reason: 'emit-stopped', ...(note ? { note } : {}) } : null,
    };
  },
};


export const { mayBreak, finish } = runner;
