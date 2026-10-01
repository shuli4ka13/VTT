import { rollNotation, multiplyNotation } from '../dice.ts';
import type { NotationRoll } from '../dice.ts';
import { dieText } from '../lead-die.ts';
import { packRef, resolveRef, resolveOptionalNumber } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import { guardHolds, packGuardRef } from '../rule.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'amount';
const words: StepWords = STEP_WORDS.amount;
export const { label, hint, slots, outputs } = words;

export const SOURCES = ['roll', 'margin', 'item'];

export const once = (): boolean => true;

export const mayBreak = false;

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
  if (t.rolls.length) {
    const notation = String(t.notation ?? '').replace(/d/gi, 'к');
    parts.push(`${notation ? `${notation} ` : ''}[${t.rolls.join(', ')}]`);
  }
  if (t.flat || t.source === 'item') parts.push(String(t.flat));
  if (t.bonus) parts.push(String(t.bonus));
  if (t.margin) parts.push(`запас ${t.margin}`);
  if (!parts.length) parts.push('0');
  const formula = parts.join(' + ').replace(/\+ -/g, '− ');
  return `расчёт: ${formula} = ${t.total}`;
}

function diceRef(ref: unknown, ctx: StepContext): unknown {
  if (!ref || typeof ref !== 'object' || !('constant' in ref)) return ref;
  return { const: dieText(ctx.system, String((ref as { constant: unknown }).constant)) };
}

export function pack(step: StepData, ctx: StepContext) {
  const source = constant(packRef(step.source, ctx), ctx, 'источник величины');
  if (!SOURCES.includes(source)) {
    throw new EngineError(
      `${who(ctx)}: неизвестный источник величины «${source}» — умею: ${SOURCES.join(', ')}`);
  }

  const written = step.dice ? constant(packRef(diceRef(step.dice, ctx), ctx), ctx, 'кости величины') : null;
  const times = timesNow(step, ctx);
  const plain = written !== null && times !== null ? countedNotation(written, times) : written;
  const doubled = plain !== null && doublesNow(step, ctx);
  const notation = doubled ? multiplyNotation(plain, 2) : plain;
  const thrown: { sides: number; value: number }[] = [];
  const watched: StepContext = { ...ctx, die: sides => { const value = ctx.die(sides); thrown.push({ sides, value }); return value; } };
  const fixed = step.fixed !== undefined ? packRef(step.fixed, watched) : null;
  const bonus = step.bonus !== undefined ? packRef(step.bonus, ctx) : null;
  const margin = step.margin !== undefined ? packRef(step.margin, ctx) : null;

  if (source === 'roll' && !written) {
    throw new EngineError(`${who(ctx)}: источнику «свой бросок» нужны кости — слот dice пуст`);
  }
  const deferred = typeof fixed === 'object' && fixed !== null
    && 'later' in (fixed as Record<string, unknown>);
  if (source === 'item' && !deferred
    && (fixed === null || (typeof fixed === 'object' && (fixed as any).const == null))) {
    throw new EngineError(`${who(ctx)}: источнику «фикс предмета» нужен заполненный слот fixed`);
  }
  if (source === 'margin' && !margin) {
    throw new EngineError(
      `${who(ctx)}: источнику «превышение» нужен слот margin — превышение какого шага брать?`);
  }

  const held = ctx.kept?.[String(step.id ?? '')]?.rolled as NotationRoll | undefined;
  return {
    source,
    rolled: notation ? rollNotation(notation, ctx.die, held) : fromFormula(thrown),
    ...(doubled ? { doubled: true } : {}),
    ...(times !== null ? { times } : {}),
    ...(step.scale ? {
      scale: {
        times: packRef(step.scale.times, ctx),
        ...(step.scale.when ? { when: packGuardRef(step.scale.when, ctx) } : {}),
      },
    } : {}),
    fixed, bonus, margin,
  };
}

function fromFormula(thrown: { sides: number; value: number }[]) {
  return {
    notation: null, rolls: thrown.map(one => one.value), total: 0,
    ...(thrown.length ? {
      tally: {
        dice: thrown.length,
        atMax: thrown.filter(one => one.value === one.sides).length,
        atMin: thrown.filter(one => one.value === 1).length,
      },
    } : {}),
  };
}

function timesNow(step: StepData, ctx: StepContext): number | null {
  if (step.count === undefined || step.count === null) return null;
  const raw = constant(packRef(step.count, ctx), ctx, 'сколько раз кинуть кости');
  const times = Number(raw);
  if (!Number.isFinite(times)) {
    throw new EngineError(`${who(ctx)}: «сколько раз кинуть кости» должно быть числом, а пришло ${JSON.stringify(raw)}`);
  }
  return Math.max(0, Math.floor(times));
}

function countedNotation(notation: unknown, times: number): string | null {
  if (times <= 0) return null;
  return multiplyNotation(notation, times);
}

function doublesNow(step: StepData, ctx: StepContext): boolean {
  if (step.double === undefined || step.double === null) return false;
  return guardHolds(step.double, ctx);
}

export function resolve(step: StepData, ctx: StepContext) {
  const flat = resolveOptionalNumber(step.fixed, ctx, 'фикс величины') ?? 0;
  const bonus = resolveOptionalNumber(step.bonus, ctx, 'бонус величины') ?? 0;
  const margin = resolveOptionalNumber(step.margin, ctx, 'превышение для величины') ?? 0;
  const full = step.rolled.total + flat + bonus + margin;
  const share = shareOf(step, ctx);
  const total = share === null ? full : Math.floor(full * share);

  return {
    value: total,
    trace: {
      source: step.source,
      notation: step.rolled.notation, rolls: step.rolled.rolls,
      ...(step.doubled ? { doubled: true } : {}),
      ...(step.times !== undefined ? { times: step.times } : {}),
      ...(share === null ? {} : { share, full }),
      flat, bonus, margin, total,
    },
    break: null,
  };
}

function shareOf(step: StepData, ctx: StepContext): number | null {
  const scale = step.scale as { times?: unknown; when?: unknown } | undefined;
  if (!scale) return null;
  const times = Number(resolveRef(scale.times, ctx));
  if (!Number.isFinite(times) || times <= 0) {
    throw new EngineError(`${who(ctx)}: доля величины должна быть положительным числом, а пришло ${JSON.stringify(scale.times)}`);
  }
  return guardHolds(scale.when, ctx) ? times : null;
}

function constant(packed: unknown, ctx: StepContext, what: string): any {
  if (packed === null || typeof packed !== 'object') return packed;
  if ('const' in packed) return packed.const;
  if ('expr' in packed && (packed as Record<string, unknown>).later) return resolveRef(packed, ctx);
  throw new EngineError(
    `${who(ctx)}: ${what} должен быть известен отправителю, а пришло ${JSON.stringify(packed)}`);
}

function who(ctx: StepContext): string {
  return ctx.owner || 'правило';
}
