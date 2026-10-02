import { compile } from '../../formula/index.ts';
import { findField } from '../calc.ts';
import { applyValueModifiers } from '../modifiers.ts';
import { incomingTagOf } from '../targets.ts';
import { EngineError } from '../errors.ts';
import type { Pass } from '../calc.ts';
import type { StoredValue } from '../../model/types.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'apply';
const words: StepWords = STEP_WORDS.apply;
export const { label, hint, slots, outputs } = words;

const DIRECTIONS: Record<string, (from: number, x: number) => number> = {
  add: (from, x) => from + x,
  subtract: (from, x) => from - x,
  set: (_from, x) => x,
};

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

const who = (ctx: StepContext): string => ctx.owner || 'правило';

function boundOf(bound: unknown, pass: Pass, what: string): number | null {
  if (bound === undefined || bound === null || bound === '') return null;
  const value = typeof bound === 'number' ? bound : compile(String(bound)).evaluate(pass.resolve);
  if (typeof value !== 'number') throw new EngineError(`${what} — не число (${JSON.stringify(bound)} даёт ${typeof value})`);
  return value;
}

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish' | 'splits'> = {
  finish(step, ctx) {
    const direction = String(step.direction || 'subtract');
    if (!DIRECTIONS[direction]) throw new EngineError(`${who(ctx)}: неизвестное направление «${direction}» — умею: ${Object.keys(DIRECTIONS).join(', ')}`);
    const target = step.target;
    const tag = typeof target === 'string' ? target
      : target && typeof target === 'object' && 'tag' in target ? String(target.tag)
        : String(ctx.value(target));
    const field = findField(ctx.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — применять некуда`);
    if (field.value.kind !== 'stored') throw new EngineError(`в поле «${tag}» нельзя писать: его считает движок по формуле, а не эффект`);
    const from = ctx.read(tag);
    const raw = ctx.value(step.value);
    if (direction === 'set' && (typeof from !== 'number' || typeof raw !== 'number')) {
      ctx.write(tag, raw as StoredValue);
      return { value: { amount: raw, from, to: raw, overkill: 0 }, trace: { target: tag, direction, incoming: raw, amount: raw, from, to: raw }, break: null };
    }
    if (typeof from !== 'number') throw new EngineError(`поле «${tag}» держит не число (${typeof from}) — прибавлять и вычитать нечего`);
    if (typeof raw !== 'number') throw new EngineError(`${who(ctx)}: величина применения — не число (даёт ${raw === null ? 'пусто' : typeof raw})`);
    const value = raw;
    const incoming = direction === 'set' ? Math.abs(value - from) : value;
    const amountNow = step.targetModifiers ? Math.floor(Number(applyValueModifiers(incoming, incomingTagOf(tag), ctx.here))) : incoming;
    const next = direction === 'set' ? from + Math.sign(value - from) * amountNow : DIRECTIONS[direction]!(from, amountNow);
    const low = boundOf(field.value.min, ctx.here, 'нижняя граница поля');
    const high = boundOf(field.value.max, ctx.here, 'верхняя граница поля');
    const to = low !== null && next < low ? low : high !== null && next > high ? high : next;
    const overkill = low !== null && next < low ? low - next : 0;
    ctx.write(tag, to);
    return { value: { amount: amountNow, from, to, overkill }, trace: { target: tag, direction, incoming, amount: amountNow, from, to }, break: null };
  },
};


export const { finish } = runner;
