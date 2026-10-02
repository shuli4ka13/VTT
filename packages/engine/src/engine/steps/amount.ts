import { EngineError } from '../errors.ts';
import { start, result, times } from '../../core/dice.ts';
import type { RollResult } from '../../core/dice.ts';
import type { Die } from '../../model/types.ts';
import { diceOf } from './dice-ref.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'amount';
const words: StepWords = STEP_WORDS.amount;
export const { label, hint, slots, outputs } = words;

export const SOURCES = ['roll', 'margin', 'item'];



export const icon = 'Σ';

export function lint(step: StepData) {
  const source = step.source && typeof step.source === 'object' ? null : step.source;
  if (source === null) return null;
  if (!SOURCES.includes(source)) return `неизвестный источник «${source}» — умею: ${SOURCES.join(', ')}`;
  if (source === 'roll' && !step.dice) return 'источнику «свой бросок» нужны кости — слот dice пуст';
  if (source === 'item' && !step.fixed) return 'источнику «фикс предмета» нужен слот fixed';
  if (source === 'margin' && !step.margin) return 'источнику «превышение» нужен слот margin — превышение какого шага брать?';
  return null;
}

export function traceLine(t: any) {
  const parts: string[] = [];
  const own = t.rolls.length > 0 && t.notation;
  if (own) parts.push(`${String(t.notation).replace(/d/gi, 'к')} [${t.rolls.join(', ')}]`);
  const thrown = t.rolls.length && !own ? ` [${t.rolls.join(', ')}]` : '';
  if (t.flat || t.source === 'item') parts.push(`${t.flat}${thrown}`);
  if (t.bonus) parts.push(String(t.bonus));
  if (t.margin) parts.push(`запас ${t.margin}`);
  if (!parts.length) parts.push('0');
  const formula = parts.join(' + ').replace(/\+ -/g, '− ');
  return `расчёт: ${formula} = ${t.total}`;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

function watchedDie(ctx: StepContext, thrown: { sides: number; value: number }[]): Die {
  return sides => { const value = ctx.die(sides); thrown.push({ sides, value }); return value; };
}

function tally(thrown: { sides: number; value: number }[]): Pick<RollResult, 'rolled' | 'atMax' | 'atMin'> {
  return {
    rolled: thrown.length,
    atMax: thrown.filter(one => one.value === one.sides).length,
    atMin: thrown.filter(one => one.value === 1).length,
  };
}

function withDie<T>(ctx: StepContext, die: Die, work: (inner: StepContext) => T): T {
  return work(ctx.using(die));
}

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish' | 'splits'> = {
  once: () => true,
  prepare(step, ctx) {
    const source = String(ctx.value(step.source) ?? step.source);
    if (!SOURCES.includes(source)) throw new EngineError(`${who(ctx)}: неизвестный источник величины «${source}» — умею: ${SOURCES.join(', ')}`);
    const written = diceOf(step.dice, ctx);
    if (source === 'roll' && !written) throw new EngineError(`${who(ctx)}: источнику «свой бросок» нужны кости — слот dice пуст`);
    if (source === 'margin' && !step.margin) throw new EngineError(`${who(ctx)}: источнику «превышение» нужен слот margin — превышение какого шага брать?`);
    const many = step.count === undefined || step.count === null ? null : Math.max(0, Math.floor(ctx.number(step.count, 'сколько раз кинуть кости')));
    const doubled = written !== null && many !== 0 && step.double !== undefined && step.double !== null && ctx.holds(step.double);
    const spec = written === null || many === 0 ? null : times(written, (many ?? 1) * (doubled ? 2 : 1));
    const formula: { sides: number; value: number }[] = [];
    const slot = (ref: unknown, what: string, watched: boolean): number | null | undefined => {
      if (ref === undefined || ref === null) return null;
      if (!ctx.known(ref)) return undefined;
      return watched ? withDie(ctx, watchedDie(ctx, formula), inner => inner.optional(ref, what)) : ctx.optional(ref, what);
    };
    const fixed = slot(step.fixed, 'фикс величины', true);
    if (source === 'item' && fixed === null) throw new EngineError(`${who(ctx)}: источнику «фикс предмета» нужен заполненный слот fixed`);
    const bonus = slot(step.bonus, 'бонус величины', false);
    const margin = slot(step.margin, 'превышение для величины', false);
    const notated: { sides: number; value: number }[] = [];
    const rolled = spec ? start(spec, [], watchedDie(ctx, notated)) : null;
    const thrown = rolled ? notated : formula;
    const rolls = thrown.map(one => one.value);
    const natural = rolls.reduce((sum, v) => sum + v, 0);
    const constBonus = typeof bonus === 'number' && step.bonus && typeof step.bonus === 'object' && 'const' in step.bonus ? bonus : 0;
    const summary: RollResult = {
      total: (rolled ? result(rolled).total : natural) + constBonus, natural,
      ...tally(thrown), edited: false, dice: { rolls, kept: null }, parts: {}, tags: [],
    };
    const scaled = step.scale !== undefined && step.scale !== null;
    const whole = !scaled && fixed !== undefined && bonus !== undefined && margin !== undefined;
    return {
      ...(whole ? { value: (rolled ? result(rolled).total : 0) + (fixed ?? 0) + (bonus ?? 0) + (margin ?? 0) } : {}),
      source, notation: spec ? `${spec.terms[0]!.count}d${spec.terms[0]!.sides}` : null,
      diceTotal: rolled ? result(rolled).total : 0, rolls, thrown,
      ...(doubled ? { doubled: true } : {}), ...(many !== null ? { times: many } : {}),
      fixed, bonus, margin, summary,
    };
  },
  finish(step, ctx, prepared) {
    const p = prepared ?? runner.prepare!(step, ctx);
    const thrown = [...(p.thrown as { sides: number; value: number }[])];
    const late = (known: unknown, ref: unknown, what: string): number => (known === undefined
      ? ctx.optional(ref, what) ?? 0
      : (known as number | null) ?? 0);
    const flat = late(p.fixed, step.fixed, 'фикс величины');
    const bonus = late(p.bonus, step.bonus, 'бонус величины');
    const margin = late(p.margin, step.margin, 'превышение для величины');
    const full = (p.diceTotal as number) + flat + bonus + margin;
    const scale = step.scale as { times?: unknown; when?: unknown } | undefined;
    let share: number | null = null;
    if (scale) {
      const n = Number(ctx.value(scale.times));
      if (!Number.isFinite(n) || n <= 0) throw new EngineError(`${who(ctx)}: доля величины должна быть положительным числом, а пришло ${JSON.stringify(scale.times)}`);
      share = ctx.holds(scale.when) ? n : null;
    }
    const total = share === null ? full : Math.floor(full * share);
    const rolls = thrown.map(one => one.value);
    return {
      value: total,
      roll: { ...(p.summary as RollResult), dice: { rolls, kept: null }, ...tally(thrown) },
      trace: {
        source: p.source, notation: p.notation, rolls,
        ...(p.doubled ? { doubled: true } : {}),
        ...(p.times !== undefined ? { times: p.times } : {}),
        ...(share === null ? {} : { share, full }),
        flat, bonus, margin, total,
      },
      break: null,
    };
  },
};


export const { once, prepare, finish } = runner;
export const mayBreak = false;
