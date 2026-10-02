import { EngineError } from '../errors.ts';
import { lonelyField } from '../refs.ts';
import { requireCalled } from '../effects.ts';
import { amountParamOf } from '../../model/lists.ts';
import type { EmittedEvent } from '../rule.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'emit';
const words: StepWords = STEP_WORDS.emit;
export const { label, hint, slots, outputs } = words;


export function breakLine(step: StepData) {
  return step.strict ? words.breakLines.strict ?? null : null;
}

export function reasonWord(reason: string): string | null {
  return words.reasons[reason] ?? null;
}

export const icon = '➤';

export function lint(step: StepData) {
  if (!step.event) return 'вызову нужен общий эффект — они живут среди эффектов, в группе «Общие»';
  return null;
}

export function traceLine(t: any, h: any) {
  const name = typeof h?.eventLabel === 'function' ? h.eventLabel(t.event) : t.event;
  if (t.to === 'sender') return `отвечает отправителю: зовёт «${name}» у него`;
  const tags = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
  const mods = t.incoming !== t.amount
    ? ` (отправлено ${t.incoming}, после модификаторов цели ${t.amount})`
    : '';
  return `зовёт «${name}»${tags}: ${t.amount}${mods}`;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

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

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish' | 'splits'> = {
  mayBreak: true,
  finish(step, ctx) {
    const id = String(step.event ?? '');
    const spec = requireCalled(ctx.system, id, who(ctx));
    const params = spec.params ?? [];
    const args: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries((step.args ?? {}) as Record<string, unknown>)) {
      const field = params.find(p => p.key === key)?.kind === 'tag' ? lonelyField(ref, ctx.system) : null;
      const value = field ?? ctx.value(ref);
      if (value !== null && value !== undefined) args[key] = value;
    }
    if (step.to === 'sender') {
      ctx.reply(id, args);
      return { value: { event: id, answered: true, args }, trace: { event: id, to: 'sender', args }, break: null };
    }
    const main = amountParamOf(spec);
    const incoming = main && args[main.key] !== undefined ? Number(args[main.key]) : 0;
    if (!Number.isFinite(incoming)) throw new EngineError(`«${main!.label ?? main!.key}» вызова «${spec.label ?? id}»: ждали число, пришло «${String(args[main!.key])}»`);
    const tags = chosenTags(params, args);
    const amountNow = main ? Math.floor(ctx.edited(id, main.key, incoming, tags, args)) : incoming;
    if (main) args[main.key] = amountNow;
    const payload: EmittedEvent = { event: id, amount: amountNow, incoming, tags };
    const out = ctx.call(id, args, payload);
    const received = out.stopped ? String(out.stopped.reason ?? 'оборвано') : null;
    const note = out.stopped?.note ?? null;
    return {
      value: payload,
      trace: { event: id, incoming, amount: payload.amount, tags, ...(received ? { received } : {}) },
      break: step.strict && received ? { reason: 'emit-stopped', ...(note ? { note } : {}) } : null,
    };
  },
};


export const { mayBreak, finish } = runner;

export function answerSteps(call: { event: string; args: Record<string, unknown> }): StepData[] {
  return [{
    type, event: call.event,
    args: Object.fromEntries(Object.entries(call.args).map(([key, value]) => [key, { const: value }])),
  } as StepData];
}
