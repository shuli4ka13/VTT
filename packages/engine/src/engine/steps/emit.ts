import { packRef, resolveRef, lonelyField } from '../refs.ts';
import { editNumber } from '../modifiers.ts';
import { requireCalled } from '../effects.ts';
import { amountParamOf } from '../../model/lists.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'emit';
const words: StepWords = STEP_WORDS.emit;
export const { label, hint, slots, outputs } = words;

export const mayBreak = true;

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

export function pack(step: StepData, ctx: StepContext) {
  const id = String(step.event ?? '');
  requireCalled(ctx.system, id, who(ctx));
  const params = ctx.system.effects[id]?.params ?? [];
  const args = step.args && typeof step.args === 'object'
    ? Object.fromEntries(Object.entries(step.args as Record<string, unknown>).map(([key, ref]) => {
      const field = params.find(p => p.key === key)?.kind === 'tag' ? lonelyField(ref, ctx.system) : null;
      return [key, field ? { const: field } : packRef(ref, ctx)];
    }))
    : undefined;
  return {
    event: id,
    ...(args ? { args } : {}),
    ...(step.strict ? { strict: true } : {}),
    ...(step.to === 'sender' ? { to: 'sender' } : {}),
  };
}

export function resolve(step: StepData, ctx: StepContext) {
  const id = String(step.event);
  const spec = requireCalled(ctx.system, id, who(ctx));
  const args = argsOf(step.args, ctx) ?? {};
  if (step.to === 'sender') {
    if (!ctx.answer) throw new EngineError(`${who(ctx)}: ответить отправителю здесь некому — шаг должен стоять в цепочке получателя`);
    ctx.answer({ event: id, args });
    return { value: { event: id, answered: true, args }, trace: { event: id, to: 'sender', args }, break: null };
  }
  const main = amountParamOf(spec);
  const incoming = main && args[main.key] !== undefined
    ? number(args[main.key], `«${main.label ?? main.key}» вызова «${spec.label ?? id}»`)
    : 0;
  const tags = chosenTags(spec, args);
  const amount = Math.floor(editNumber(ctx.pass, id, main?.key ?? '', incoming, tags, args));
  const payload = { event: id, amount, incoming, tags };
  if (main) args[main.key] = amount;

  ctx.emit?.(payload);

  let received: string | null = null;
  let note: string | null = null;
  if (ctx.run) {
    const out = ctx.run(spec.steps ?? [], { event: payload }, id, Object.keys(args).length ? args : undefined, spec.params ?? []);
    if (out.stopped) {
      received = String(out.stopped.reason ?? 'оборвано');
      note = out.stopped.note ?? null;
    }
  }

  return {
    value: payload,
    trace: { event: id, incoming, amount, tags, ...(received ? { received } : {}) },
    break: step.strict && received ? { reason: 'emit-stopped', ...(note ? { note } : {}) } : null,
  };
}

export function answerSteps(call: { event: string; args: Record<string, unknown> }): StepData[] {
  return [{
    type, event: call.event,
    args: Object.fromEntries(Object.entries(call.args).map(([key, value]) => [key, { const: value }])),
  } as StepData];
}

function argsOf(raw: unknown, ctx: StepContext): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(raw as Record<string, unknown>)) {
    const value = resolveRef(ref, ctx);
    if (value !== null && value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}


const who = (ctx: StepContext): string => ctx.owner || 'правило';

function number(value: unknown, what: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new EngineError(`${what}: ждали число, пришло «${String(value)}»`);
  return n;
}

function chosenTags(spec: { params?: { key: string; kind?: string; from?: string }[] }, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const param of spec.params ?? []) {
    if (param.kind !== 'choice' || !param.from) continue;
    const value = args[param.key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else out.push(String(value));
  }
  return out;
}
