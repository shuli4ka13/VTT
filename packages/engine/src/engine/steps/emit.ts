import { packRef, resolveRef, resolveOptionalNumber } from '../refs.ts';
import { applyValueModifiers } from '../modifiers.ts';
import { eventTagOf } from '../targets.ts';
import { requireEvent } from '../effects.ts';
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
  if (!step.event) return 'отправке нужно событие — заведите его в «Словарях»';
  return null;
}

export function traceLine(t: any, h: any) {
  const name = typeof h?.eventLabel === 'function' ? h.eventLabel(t.event) : t.event;
  const tags = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
  const mods = t.incoming !== t.amount
    ? ` (отправлено ${t.incoming}, после модификаторов цели ${t.amount})`
    : '';
  return `событие «${name}»${tags}: ${t.amount}${mods}`;
}

export function pack(step: StepData, ctx: StepContext) {
  const id = String(step.event ?? '');
  requireEvent(ctx.system, id, who(ctx));
  const tags = (Array.isArray(step.tags) ? step.tags : [])
    .map((t: unknown) => (typeof t === 'string' ? t : packRef(t, ctx)));
  return {
    event: id,
    amount: step.amount === undefined ? null : packRef(step.amount, ctx),
    tags,
    ...(step.strict ? { strict: true } : {}),
  };
}

export function resolve(step: StepData, ctx: StepContext) {
  const id = String(step.event);
  const spec = requireEvent(ctx.system, id, who(ctx));
  const incoming = resolveOptionalNumber(step.amount, ctx, 'величина события') ?? 0;
  const tags = tagsOf(step.tags, ctx);
  const amount = Math.floor(Number(applyValueModifiers(incoming, eventTagOf(id), ctx.pass, { tags })));
  const payload = { event: id, amount, incoming, tags };

  ctx.emit?.(payload);

  let received: string | null = null;
  let note: string | null = null;
  if (ctx.run && spec.receive?.length) {
    const out = ctx.run(spec.receive, { event: payload }, id);
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
