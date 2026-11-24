import { NotKnown } from '../errors.ts';
import { hasUnknown } from '../../formula/index.ts';
import type { Would } from '../../core/log.ts';
import { EngineError } from '../errors.ts';
import { withKeep, times as timesOf, addendsText } from '../../core/dice.ts';
import { dieSpec } from '../../core/dice-addend.ts';
import type { DieReader } from '../../core/dice-addend.ts';
import type { RollResult, Spec } from '../../core/dice.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { keepRecord } from '../../core/against.ts';
import { fieldCheck } from '../check.ts';
import { CALL_WORDS } from '../../words/calls.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'roll';
const words: StepWords = STEP_WORDS.roll;
export const { slots, outputs } = words;

export const mayBreak = false;

const has = (value: unknown): boolean => value !== undefined && value !== null;

export const lazy = (step: StepData): boolean => !has(step.field) && !has(step.by) && typeof step.id === 'string';

export function headOf(field: unknown): { expr: string } | null {
  if (!field || typeof field !== 'object' || !('expr' in field)) return null;
  const found = /^\s*@([\p{L}\p{N}_]+)\./u.exec(String((field as { expr: unknown }).expr));
  return found ? { expr: `@${found[1]}` } : null;
}

const passed = (field: unknown): boolean =>
  Boolean(field && typeof field === 'object' && 'expr' in field && /^\s*@[\p{L}\p{N}_]+\s*$/u.test(String((field as { expr: unknown }).expr)));

export const thrownBy = (step: StepData): unknown => (has(step.field) ? headOf(step.field) : step.by);
export const dice = (step: StepData): boolean => has(step.die) || has(step.field);
export const stage = (step: StepData): string => (dice(step) ? 'roll' : 'amount');

export const icon = '⚄';

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

export function readerOf(ctx: StepContext, roller: string | null = null): DieReader {
  return {
    number: (ref, what) => (roller && what !== tr`сколько костей` ? ctx.numberOn(roller, ref, what) : ctx.number(ref, what)),
    text: ref => ctx.value(ref),
  };
}

export function specOf(ctx: StepContext, die: unknown, count: unknown, roller: string | null = null, times?: unknown, keep?: { n: unknown; worst: boolean }): Spec {
  if (!has(die)) throw new EngineError(tr`${who(ctx)}: броску нужна кость — константа системы или запись вроде «1к20»`);
  const counted = dieSpec(ctx.system, die, count, readerOf(ctx, roller), who(ctx));
  const kept = keep && has(keep.n) ? withKeep(counted, ctx.number(keep.n, tr`сколько оставить`), who(ctx), keep.worst ? 'worst' : 'best') : counted;
  if (times === undefined || times === null) return kept;
  const n = ctx.number(times, tr`сколько раз`);
  if (!Number.isInteger(n) || n < 0) throw new EngineError(tr`${who(ctx)}: сколько раз бросить — целое не меньше нуля, а вышло ${n}`);
  return timesOf(kept, n);
}

export function tagsOf(raw: unknown, ctx: StepContext): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.flatMap(tag => {
    if (typeof tag === 'string') return [tag];
    const value = ctx.value(tag);
    if (hasUnknown(value)) return [];
    if (Array.isArray(value)) return value.map(String);
    return value === null || value === undefined || value === '' ? [] : [String(value)];
  }))];
}

const fieldName = (ref: unknown): string => {
  const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : '';
  return /^\s*@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)\s*$/u.exec(expr)?.[1] ?? '';
};

export function aimed<T>(ctx: StepContext, read: () => T, would: () => Would): T {
  try {
    return read();
  } catch (err) {
    if (err instanceof NotKnown) ctx.land(would());
    throw err;
  }
}

export interface Rolled extends RollResult {
  versusShift: number;
  degreeShift: number;
}

function fieldFinish(step: StepData, ctx: StepContext) {
  const at = aimed(ctx, () => ctx.field(step.field), () => ({ roll: fieldName(step.field), tags: tagsOf(step.tags, ctx) }));
  const other = has(step.second) ? ctx.field(step.second) : null;
  if (other && other.sheet !== at.sheet) throw new EngineError(tr`${who(ctx)}: два поля одного броска — с одного листа`);
  const check = fieldCheck(ctx.system, at.tag, other?.tag);
  const shift = ctx.optional(step.shift, tr`поправка к числу поля`) ?? 0;
  const extra = ctx.optional(step.bonus, tr`прибавка броска`) ?? 0;
  const against = ctx.ahead?.() ?? null;
  const made = ctx.fieldRoll(at.sheet, check, { shift, tags: tagsOf(step.tags, ctx), against });
  if (extra && made.threshold !== null) throw new EngineError(tr`${who(ctx)}: «${check.label}» сравнивают с порогом — прибавку к итогу не прибавить, пишите поправку к числу поля`);
  const total = made.total + extra;
  const result = made.thrown.result;
  const roll: Rolled & { success?: boolean; margin?: number; degree?: string } = {
    ...result, total,
    versusShift: made.threshold === null ? made.thrown.roll.claim.versusShift : 0,
    degreeShift: made.margin === null ? made.thrown.roll.claim.degreeShift : 0,
    ...(made.success === null ? {} : { success: made.success }),
    ...(made.margin === null ? {} : { margin: made.margin }),
    ...(made.degree === null ? {} : { degree: made.degree }),
  };
  if (made.thrown.thrower && made.threshold === null) keepRecord(roll, made.thrown.thrower, made.bonus + extra);
  const tags = made.thrown.thrower?.tags ?? result.tags ?? [];
  return {
    value: total,
    roll,
    trace: {
      rolls: roll.dice.rolls, kept: roll.dice.kept, bonus: made.bonus + extra, total, by: at.sheet,
      ...(tags.length ? { tags } : {}),
      ...(made.thrown.roll.claim.read.kind !== 'sum' ? { read: made.thrown.roll.claim.read.kind } : {}),
      ...(made.thrown.roll.edits.length ? { edits: made.thrown.roll.edits } : {}),
      ...(made.thrown.roll.canceled?.length ? { canceled: made.thrown.roll.canceled } : {}),
      ...(made.thrown.roll.addends.length ? { adds: made.thrown.roll.addends } : {}),
      ...(Object.keys(roll.parts).length ? { parts: roll.parts } : {}),
      ...(made.threshold === null ? {} : { threshold: made.threshold, under: check.under === true }),
      ...(made.success === null ? {} : { success: made.success }),
      ...(made.margin === null ? {} : { margin: made.margin }),
      ...(check.margin && made.margin !== null ? { said: made.margin } : {}),
      ...(made.degree === null ? {} : { degree: made.degree }),
    },
    break: null,
  };
}

export function finish(step: StepData, ctx: StepContext) {
  if (has(step.field)) return fieldFinish(step, ctx);
  const tags = tagsOf(step.tags, ctx);
  const by = aimed(ctx, () => ctx.sheet(step.by, tr`кто бросает`), () => ({ roll: '', tags }));
  const against = by ? ctx.ahead?.() ?? null : null;
  if (step.die === undefined && step.fixed === undefined) throw new EngineError(tr`${who(ctx)}: броску нужна кость или формула`);
  const bonus = ctx.optional(step.bonus, tr`прибавка броска`) ?? 0;
  const shown = step.bonus !== undefined && step.bonus !== null ? { ref: step.bonus, value: bonus } : undefined;
  const thrown = step.die !== undefined && step.die !== null ? ctx.roll(specOf(ctx, step.die, step.count, by, step.times, { n: step.keep, worst: step.keepWorst === true }), tags, by, against, shown) : null;
  const fixed = step.fixed !== undefined && step.fixed !== null ? ctx.optional(step.fixed, tr`формула броска`) ?? 0 : 0;
  const base: RollResult = thrown ? thrown.result : {
    total: 0, natural: 0, rolled: 0, atMax: 0, atMin: 0,
    edited: false, dice: { rolls: [], kept: null }, parts: {}, tags, words: [],
  };
  const total = (thrown ? thrown.result.total : 0) + fixed + bonus;
  const roll: Rolled = {
    ...base, total,
    versusShift: thrown?.roll.claim.versusShift ?? 0,
    degreeShift: thrown?.roll.claim.degreeShift ?? 0,
  };
  if (thrown?.thrower) keepRecord(roll, thrown.thrower, fixed + bonus);
  return {
    value: total,
    roll,
    trace: {
      rolls: roll.dice.rolls, kept: roll.dice.kept, ...(thrown ? {} : { fixed }), bonus, total,
      ...(by ? { by } : {}),
      ...(tags.length ? { tags } : {}),
      ...(thrown && thrown.roll.claim.read.kind !== 'sum' ? { read: thrown.roll.claim.read.kind } : {}),
      ...(thrown?.roll.edits.length ? { edits: thrown.roll.edits } : {}),
      ...(thrown?.roll.canceled?.length ? { canceled: thrown.roll.canceled } : {}),
      ...(thrown?.roll.addends.length ? { adds: thrown.roll.addends } : {}),
      ...(Object.keys(roll.parts).length ? { parts: roll.parts } : {}),
    },
    break: null,
  };
}

export function lint(step: StepData): string | null {
  if (has(step.field)) {
    if (has(step.die) || has(step.fixed) || has(step.count) || has(step.times)) return tr`бросок поля берёт кость из «Правил → Броски» — кость, сколько костей и формулу уберите`;
    if (has(step.by)) return tr`бросок поля бросает тот, чьё поле, — «Кто бросает» уберите`;
    if (!headOf(step.field) && !passed(step.field)) return tr`бросок поля: не выбрано поле, которое бросают`;
    return null;
  }
  if (has(step.shift)) return tr`поправка к числу — только у броска поля`;
  if (has(step.second)) return tr`второе поле — только у броска поля`;
  if (has(step.times) && !has(step.die)) return tr`«сколько раз» — только у броска кости`;
  if ((has(step.keep) || has(step.keepWorst)) && !has(step.die)) return tr`«оставить» — только у броска кости`;
  if (has(step.keepWorst) && !has(step.keep)) return tr`«оставить худшие» без числа — сколько оставить, не задано`;
  if (has(step.die) && has(step.fixed)) return tr`кость и формула в одном шаге — формулу перенесите в прибавку`;
  if (step.die === undefined && step.fixed === undefined) return tr`шаг пуст: впишите формулу или выберите бросок`;
  return null;
}

export const problems = lint;

export function traceLine(t: any) {
  const name = t.tags?.length ? ` «${t.tags.join(', ')}»` : '';
  const adds: { label: string; value: number }[] = t.adds ?? [];
  const added = adds.reduce((sum, one) => sum + one.value, 0);
  const dice = t.read === 'count' ? tr`[${t.rolls.join(', ')}] → успехов ${t.total - t.bonus - added}`
    : t.kept != null && t.rolls.length > 1 ? `[${t.rolls.join(', ')}] → ${t.kept}`
      : t.rolls.length ? `[${t.rolls.join(', ')}]` : '';
  const parts = t.parts && Object.keys(t.parts).length ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
  const edits = t.edits?.length ? ` (${t.edits.join(', ')})` : '';
  const gone = CALL_WORDS.roll.canceled(t.canceled ?? []);
  const plain = Array.isArray(t.rolls) && t.rolls.reduce((sum: number, v: number) => sum + v, 0) === t.fixed;
  const fixed = t.fixed !== undefined && t.fixed !== 0 && !plain ? String(t.fixed) : '';
  const sum = [fixed && dice ? `${dice} → ${fixed}` : dice || fixed, t.bonus ? String(t.bonus) : ''].filter(Boolean).join(' + ').replace(/\+ -/g, '− ') || '0';
  const verdict = t.threshold === undefined ? '' : ` · ${t.under ? tr`не больше` : tr`порог`} ${t.threshold}`;
  const passed = t.success === undefined ? '' : `${verdict ? ':' : ' ·'} ${t.success ? tr`успех` : tr`провал`}`;
  const graded = `${verdict}${passed}${t.margin === undefined ? '' : tr` · степеней: ${t.margin}`}${t.degree ? ` · ${t.degree}` : ''}`;
  return `${t.by ? tr`бросок` : tr`расчёт`}${name}: ${sum}${edits}${addendsText(adds)} = ${t.total}${parts}${graded}${gone}`;
}


