import { lookupTable } from '../tables.ts';
import { rollNotation } from '../dice.ts';
import { packRef, resolveNumber, resolveRef } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'table';
const words: StepWords = STEP_WORDS.table;
export const { label, hint, slots, outputs } = words;

export const mayBreak = false;

export const icon = '▦';

export function traceLine(t: any, h: any) {
  const rolls = t.rolls?.length ? `[${t.rolls.join(', ')}] = ` : '';
  return `таблица «${h.labelOf(t.table)}»: ${rolls}${t.value} → ${t.result}`;
}

const nameOf = (packed: unknown, ctx: StepContext): string => {
  const value = resolveRef(packed, ctx);
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new EngineError(`${ctx.owner || 'правило'}: шагу «таблица» не сказано, какую таблицу читать`);
  return name;
};

export function pack(step: StepData, ctx: StepContext) {
  if (!step.table) throw new EngineError(`${ctx.owner || 'правило'}: шагу «таблица» не сказано, какую таблицу читать`);

  const packed: Record<string, unknown> = { table: packRef(step.table, ctx) };
  if (step.dice !== undefined && step.dice !== null) {
    packed.dice = packRef(step.dice, ctx);
  } else if (step.value !== undefined && step.value !== null) {
    packed.value = packRef(step.value, ctx);
  } else {
    throw new EngineError(`${ctx.owner || 'правило'}: шагу «таблица» нужен аргумент — число или кости`);
  }
  return packed;
}

export function resolve(step: StepData, ctx: StepContext) {
  const table = nameOf(step.table, ctx);
  const rolls: number[] = [];
  let value: number;

  if (step.dice !== undefined && step.dice !== null) {
    const notation = resolveRef(step.dice, ctx);
    const thrown = rollNotation(notation, ctx.die);
    rolls.push(...thrown.rolls);
    value = thrown.total;
  } else {
    value = resolveNumber(step.value, ctx, 'аргумент таблицы');
  }

  const result = lookupTable(ctx.system, table, value, ctx.owner);

  return {
    value: result,
    trace: { table, value, ...(rolls.length ? { rolls } : {}), result },
    break: null,
  };
}
