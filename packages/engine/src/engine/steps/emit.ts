import { packRef, resolveRef, resolveOptionalNumber } from '../refs.ts';
import { applyValueModifiers } from '../modifiers.ts';
import { eventTagOf } from '../targets.ts';
import { requireCalled } from '../effects.ts';
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
  const tags = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
  const mods = t.incoming !== t.amount
    ? ` (отправлено ${t.incoming}, после модификаторов цели ${t.amount})`
    : '';
  return `зовёт «${name}»${tags}: ${t.amount}${mods}`;
}

export function pack(step: StepData, ctx: StepContext) {
  const id = String(step.event ?? '');
  requireCalled(ctx.system, id, who(ctx));
  const tags = (Array.isArray(step.tags) ? step.tags : [])
    .map((t: unknown) => (typeof t === 'string' ? t : packRef(t, ctx)));
  const args = step.args && typeof step.args === 'object'
    ? Object.fromEntries(Object.entries(step.args as Record<string, unknown>)
      .map(([key, ref]) => [key, packRef(ref, ctx)]))
    : undefined;
  return {
    event: id,
    amount: step.amount === undefined ? null : packRef(step.amount, ctx),
    tags,
    ...(args ? { args } : {}),
    ...(step.strict ? { strict: true } : {}),
  };
}

export function resolve(step: StepData, ctx: StepContext) {
  const id = String(step.event);
  const spec = requireCalled(ctx.system, id, who(ctx));
  const incoming = resolveOptionalNumber(step.amount, ctx, 'величина общего эффекта') ?? 0;
  const tags = tagsOf(step.tags, ctx);
  const amount = Math.floor(Number(applyValueModifiers(incoming, eventTagOf(id), ctx.pass, { tags })));
  const payload = { event: id, amount, incoming, tags };

  ctx.emit?.(payload);

  let received: string | null = null;
  let note: string | null = null;
  if (ctx.run && spec.steps?.length) {
    const out = ctx.run(spec.steps, { event: payload }, id, argsOf(step.args, ctx), spec.params ?? []);
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

function argsOf(raw: unknown, ctx: StepContext): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(raw as Record<string, unknown>)) {
    const value = resolveRef(ref, ctx);
    if (value !== null && value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function tagsOf(raw: unknown, ctx: StepContext): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const value = typeof item === 'string' ? item : resolveRef(item, ctx);
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else out.push(...String(value).split(',').map(s => s.trim()).filter(Boolean));
  }
  return [...new Set(out)];
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';
