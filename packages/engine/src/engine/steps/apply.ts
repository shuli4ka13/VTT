import { compile } from '../../formula/index.ts';
import { findField } from '../calc.ts';
import { misfit } from '../../model/sheet-columns.ts';
import { parseItemTag } from '../../model/item-ref.ts';
import { EngineError, NotKnown } from '../errors.ts';
import { isUnknown } from '../../formula/index.ts';
import { aimed } from './roll.ts';
import type { Pass } from '../calc.ts';
import type { StoredValue } from '../../model/types.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'apply';
const words: StepWords = STEP_WORDS.apply;
export const { slots, outputs } = words;

const DIRECTIONS: Record<string, (from: number, x: number) => number> = {
  add: (from, x) => from + x,
  subtract: (from, x) => from - x,
  set: (_from, x) => x,
};

export const mayBreak = false;

export const icon = '✎';

export function lint(step: StepData) {
  if (!step.target) return tr`изменению нужно поле листа, например «Цель · Хиты»`;
  if (!step.value) return tr`применению нужна величина — что именно менять`;
  if (step.direction && !DIRECTIONS[step.direction]) {
    return tr`неизвестное направление «${step.direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`;
  }
  return null;
}

export function traceLine(t: any, h: any) {
  const sign = t.direction === 'add' ? '+' : t.direction === 'subtract' ? '−' : '=';
  return tr`применено: ${h.labelOf(t.target)} ${t.from} → ${t.to} (${sign}${t.amount})`;
}

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

const fieldTail = (ref: unknown): string => {
  const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : '';
  return /^\s*@[\p{L}\p{N}_]+\.(.+?)\s*$/u.exec(expr)?.[1] ?? expr;
};

function boundOf(bound: unknown, pass: Pass, what: string): number | null {
  if (bound === undefined || bound === null || bound === '') return null;
  const value = typeof bound === 'number' ? bound : compile(String(bound)).evaluate(pass.resolve);
  if (typeof value !== 'number') throw new EngineError(tr`${what} — не число (${JSON.stringify(bound)} даёт ${typeof value})`);
  return value;
}

const runner: Pick<StepModule, 'mayBreak' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const direction = String(step.direction || 'subtract');
    if (!DIRECTIONS[direction]) throw new EngineError(tr`${who(ctx)}: неизвестное направление «${direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`);
    const { sheet, tag } = aimed(ctx, () => ctx.field(step.target), () => {
      const sent = ctx.value(step.value);
      return { field: fieldTail(step.target), direction, ...(typeof sent === 'number' ? { amount: sent } : {}) };
    });
    const here = ctx.view(sheet);
    const item = parseItemTag(tag);
    const field = item ? null : findField(ctx.system, tag);
    if (!item && !field) throw new EngineError(tr`система не объявляет поля «${tag}» — применять некуда`);
    if (field && field.value.kind !== 'stored') throw new EngineError(tr`в поле «${tag}» нельзя писать: его считает движок по формуле, а не эффект`);
    const from = ctx.read(sheet, tag);
    const raw = ctx.value(step.value);
    if (isUnknown(raw)) throw new NotKnown(tr`величина применения`);
    if (direction === 'set' && (typeof from !== 'number' || typeof raw !== 'number')) {
      const wrong = field ? misfit(field, raw) : null;
      if (wrong) throw new EngineError(`${who(ctx)}: ${wrong}`);
      ctx.write(sheet, tag, raw as StoredValue);
      return { value: { amount: raw, from, to: raw, overkill: 0 }, trace: { sheet, target: tag, direction, incoming: raw, amount: raw, from, to: raw }, break: null };
    }
    if (typeof from !== 'number') throw new EngineError(tr`поле «${tag}» держит не число (${typeof from}) — прибавлять и вычитать нечего`);
    if (typeof raw !== 'number') throw new EngineError(tr`${who(ctx)}: величина применения — не число (даёт ${raw === null ? tr`пусто` : typeof raw})`);
    const value = raw;
    const incoming = direction === 'set' ? Math.abs(value - from) : value;
    const amountNow = incoming;
    const next = direction === 'set' ? from + Math.sign(value - from) * amountNow : DIRECTIONS[direction]!(from, amountNow);
    const low = field ? boundOf(field.value.min, here, tr`нижняя граница поля`) : null;
    const high = field ? boundOf(field.value.max, here, tr`верхняя граница поля`) : null;
    const to = low !== null && next < low ? low : high !== null && next > high ? high : next;
    const overkill = low !== null && next < low ? low - next : 0;
    ctx.write(sheet, tag, to);
    return { value: { amount: amountNow, from, to, overkill }, trace: { sheet, target: tag, direction, incoming, amount: amountNow, from, to }, break: null };
  },
};


export const { finish } = runner;
