import { EngineError } from '../errors.ts';
import { dieConstant } from '../lead-die.ts';
import { parse, withCount, addendsText } from '../../core/dice.ts';
import type { RollResult, Spec } from '../../core/dice.ts';
import type { Die } from '../../model/types.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import { DICE_TEXT } from '../../words/glossary.ts';
import { keepRecord } from '../../core/against.ts';
import { fieldCheck } from '../check.ts';

export const type = 'roll';
const words: StepWords = STEP_WORDS.roll;
export const { label, hint, slots, outputs } = words;

export const mayBreak = false;

const has = (value: unknown): boolean => value !== undefined && value !== null;

export const lazy = (step: StepData): boolean => !has(step.field) && !has(step.by) && typeof step.id === 'string';

export function headOf(field: unknown): { expr: string } | null {
  if (!field || typeof field !== 'object' || !('expr' in field)) return null;
  const found = /^\s*@([\p{L}\p{N}_]+)\./u.exec(String((field as { expr: unknown }).expr));
  return found ? { expr: `@${found[1]}` } : null;
}

export const thrownBy = (step: StepData): unknown => (has(step.field) ? headOf(step.field) : step.by);

export const icon = '⚄';

const who = (ctx: StepContext): string => ctx.owner || 'правило';

export function specOf(ctx: StepContext, die: unknown, count: unknown, roller: string | null = null): Spec {
  let spec: Spec;
  if (typeof die === 'string' && die) {
    spec = parse(dieConstant(ctx.system, die), (ref, what) => (roller ? ctx.numberOn(roller, ref, what) : ctx.number(ref, what)));
  } else if (die && typeof die === 'object' && 'expr' in (die as object)) {
    const text = String(ctx.value(die) ?? '');
    if (!DICE_TEXT.test(text.trim())) throw new EngineError(`«${text}» — не запись кости; жду вроде «1к20» или «2к6»`);
    spec = parse(text);
  } else {
    throw new EngineError(`${who(ctx)}: броску нужна кость — константа системы или запись вроде «1к20»`);
  }
  if (count === undefined || count === null) return spec;
  return withCount(spec, ctx.number(count, 'сколько костей'), who(ctx));
}

export function tagsOf(raw: unknown, ctx: StepContext): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.flatMap(tag => {
    if (typeof tag === 'string') return [tag];
    const value = ctx.value(tag);
    if (Array.isArray(value)) return value.map(String);
    return value === null || value === undefined || value === '' ? [] : [String(value)];
  }))];
}

function watched(ctx: StepContext, thrown: { sides: number; value: number }[]): Die {
  return sides => { const value = ctx.die(sides); thrown.push({ sides, value }); return value; };
}

export interface Rolled extends RollResult {
  versusShift: number;
  degreeShift: number;
}

function fieldFinish(step: StepData, ctx: StepContext) {
  const at = ctx.field(step.field);
  const check = fieldCheck(ctx.system, at.tag);
  const shift = ctx.optional(step.shift, 'поправка к числу поля') ?? 0;
  const extra = ctx.optional(step.bonus, 'прибавка броска') ?? 0;
  const against = ctx.ahead?.() ?? null;
  const made = ctx.fieldRoll(at.sheet, check, { shift, tags: tagsOf(step.tags, ctx), against });
  if (extra && made.threshold !== null) throw new EngineError(`${who(ctx)}: «${check.label}» сравнивают с порогом — прибавку к итогу не прибавить, пишите поправку к числу поля`);
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
  const by = ctx.sheet(step.by, 'кто бросает');
  const against = by ? ctx.ahead?.() ?? null : null;
  if (step.die === undefined && step.fixed === undefined) throw new EngineError(`${who(ctx)}: броску нужна кость или формула`);
  const bonus = ctx.optional(step.bonus, 'прибавка броска') ?? 0;
  const shown = step.bonus !== undefined && step.bonus !== null ? { ref: step.bonus, value: bonus } : undefined;
  const thrown = step.die !== undefined && step.die !== null ? ctx.roll(specOf(ctx, step.die, step.count, by), tags, by, against, shown) : null;
  const formula: { sides: number; value: number }[] = [];
  const fixed = step.fixed !== undefined && step.fixed !== null ? ctx.using(watched(ctx, formula)).optional(step.fixed, 'формула броска') ?? 0 : 0;
  const base: RollResult = thrown ? thrown.result : {
    total: 0, natural: formula.reduce((sum, one) => sum + one.value, 0), rolled: formula.length,
    atMax: formula.filter(one => one.value === one.sides).length, atMin: formula.filter(one => one.value === 1).length,
    edited: false, dice: { rolls: formula.map(one => one.value), kept: null }, parts: {}, tags,
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
      ...(thrown?.roll.addends.length ? { adds: thrown.roll.addends } : {}),
      ...(Object.keys(roll.parts).length ? { parts: roll.parts } : {}),
    },
    break: null,
  };
}

export function lint(step: StepData): string | null {
  if (has(step.field)) {
    if (has(step.die) || has(step.fixed) || has(step.count)) return 'бросок поля берёт кость из «Правил → Броски» — кость, сколько костей и формулу уберите';
    if (has(step.by)) return 'бросок поля бросает тот, чьё поле, — «Кто бросает» уберите';
    if (!headOf(step.field)) return 'бросок поля: не выбрано поле, которое бросают';
    return null;
  }
  if (has(step.shift)) return 'поправка к числу — только у броска поля';
  if (step.die === undefined && step.fixed === undefined) return 'шаг пуст: впишите формулу или выберите бросок';
  return null;
}

export const problems = lint;

export function traceLine(t: any) {
  const name = t.tags?.length ? ` «${t.tags.join(', ')}»` : '';
  const adds: { label: string; value: number }[] = t.adds ?? [];
  const added = adds.reduce((sum, one) => sum + one.value, 0);
  const dice = t.read === 'count' ? `[${t.rolls.join(', ')}] → успехов ${t.total - t.bonus - added}`
    : t.kept != null && t.rolls.length > 1 ? `[${t.rolls.join(', ')}] → ${t.kept}`
      : t.rolls.length ? `[${t.rolls.join(', ')}]` : '';
  const parts = t.parts && Object.keys(t.parts).length ? ' · ' + Object.entries(t.parts).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
  const edits = t.edits?.length ? ` (${t.edits.join(', ')})` : '';
  const plain = Array.isArray(t.rolls) && t.rolls.reduce((sum: number, v: number) => sum + v, 0) === t.fixed;
  const fixed = t.fixed !== undefined && t.fixed !== 0 && !plain ? String(t.fixed) : '';
  const sum = [fixed && dice ? `${dice} → ${fixed}` : dice || fixed, t.bonus ? String(t.bonus) : ''].filter(Boolean).join(' + ').replace(/\+ -/g, '− ') || '0';
  const verdict = t.threshold === undefined ? '' : ` · ${t.under ? 'не больше' : 'порог'} ${t.threshold}`;
  const passed = t.success === undefined ? '' : `${verdict ? ':' : ' ·'} ${t.success ? 'успех' : 'провал'}`;
  const graded = `${verdict}${passed}${t.margin === undefined ? '' : ` · степеней: ${t.margin}`}${t.degree ? ` · ${t.degree}` : ''}`;
  return `${t.by ? 'бросок' : 'расчёт'}${name}: ${sum}${edits}${addendsText(adds)} = ${t.total}${parts}${graded}`;
}


