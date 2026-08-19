import { compile } from '../../formula/index.ts';
import { findField } from '../calc.ts';
import { applyValueModifiers } from '../modifiers.ts';
import { incomingTagOf } from '../targets.ts';
import { packRef, resolveNumber, resolveRef } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import type { System } from '../../model/types.ts';

export const type = 'apply';
export const label = 'Применить';
export const hint = 'Изменить поле цели. Единственный шаг, который что-то меняет.';

const DIRECTIONS: Record<string, (from: number, x: number) => number> = {
  add: (from, x) => from + x,
  subtract: (from, x) => from - x,
  set: (_from, x) => x,
};

export const slots = [
  { key: 'target', label: 'Мишень', kind: 'tag' },
  { key: 'direction', label: 'Направление', kind: 'choice', options: Object.keys(DIRECTIONS) },
  { key: 'value', label: 'Величина', kind: 'ref' },
  { key: 'targetModifiers', label: 'Модификаторы цели', kind: 'flag' },
];

export const outputs = [
  { path: '.amount', label: 'применено' },

  { path: '.overkill', label: 'перебор' },
];

export const mayBreak = false;

export const icon = '✎';

export function lint(step: StepData) {
  if (!step.target) return 'применению нужна мишень — тег хранимого поля цели';
  if (!step.value) return 'применению нужна величина — что именно менять';
  if (step.direction && !DIRECTIONS[step.direction]) {
    return `неизвестное направление «${step.direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`;
  }
  return null;
}

export function traceLine(t: any, h: any) {
  const sign = t.direction === 'add' ? '+' : t.direction === 'subtract' ? '−' : '=';
  const mods = t.incoming !== t.amount
    ? ` (входящее ${t.incoming}, после модификаторов цели ${t.amount})`
    : '';
  return `применено: ${h.labelOf(t.target)} ${t.from} → ${t.to} (${sign}${t.amount})${mods}`;
}

export function pack(step: StepData, ctx: StepContext) {
  const direction = step.direction || 'subtract';
  if (!DIRECTIONS[direction]) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: неизвестное направление «${direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`);
  }
  return {
    target: packRef(step.target, ctx),
    direction,
    value: packRef(step.value, ctx),
    targetModifiers: !!step.targetModifiers,
  };
}

export function resolve(step: StepData, ctx: StepContext) {
  const tag = tagOf(step.target, ctx);
  const field = assertWritable(ctx.system, tag);

  const incoming = resolveNumber(step.value, ctx, 'величина применения');
  const amount = step.targetModifiers
    ? Math.floor(Number(applyValueModifiers(incoming, incomingTagOf(tag), ctx.pass)))
    : incoming;

  const from = ctx.read!(tag);
  if (typeof from !== 'number' && step.direction !== 'set') {
    throw new EngineError(
      `поле «${tag}» держит не число (${typeof from}) — прибавлять и вычитать нечего`);
  }

  const raw = DIRECTIONS[String(step.direction)]!(from as number, amount);
  const { to, overkill } = clampToField(raw, field, ctx);

  ctx.write!(tag, to);

  return {

    value: { amount, from, to, overkill },
    trace: { target: tag, direction: step.direction, incoming, amount, from, to },
    break: null,
  };
}

function clampToField(
  raw: number, field: { value: Record<string, unknown> }, ctx: StepContext,
): { to: number; overkill: number } {
  const low = boundOf(field.value.min, ctx, 'нижняя граница поля');
  const high = boundOf(field.value.max, ctx, 'верхняя граница поля');
  if (low !== null && raw < low) return { to: low, overkill: low - raw };
  if (high !== null && raw > high) return { to: high, overkill: 0 };
  return { to: raw, overkill: 0 };
}

function boundOf(bound: unknown, ctx: StepContext, what: string): number | null {
  if (bound === undefined || bound === null || bound === '') return null;
  const value = typeof bound === 'number' ? bound : compile(String(bound)).evaluate(ctx.pass.resolve);
  if (typeof value !== 'number') {
    throw new EngineError(`${what} — не число (${JSON.stringify(bound)} даёт ${typeof value})`);
  }
  return value;
}

function tagOf(ref: unknown, ctx: StepContext): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'tag' in ref) return String((ref as { tag: unknown }).tag);
  const resolved = resolveRef(ref, ctx);
  if (typeof resolved === 'string') return resolved;
  throw new EngineError(
    `${ctx.owner || 'правило'}: мишень применения должна быть тегом, а пришло ${JSON.stringify(ref)}`);
}

function assertWritable(system: System, tag: string) {
  const field = findField(system, tag);
  if (!field) throw new EngineError(`система не объявляет поля «${tag}» — применять некуда`);
  if (field.value.kind !== 'stored') {
    throw new EngineError(
      `в поле «${tag}» нельзя писать: его считает движок по формуле, а не событие`);
  }
  return field;
}
