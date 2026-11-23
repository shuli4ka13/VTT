import { readCell } from '../cells.ts';
import { VALUE_COLUMN } from '../../model/tables.ts';
import { EngineError } from '../errors.ts';
import { start, result } from '../../core/dice.ts';
import { diceOf } from './dice-ref.ts';
import type { StepContext, StepModule } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'table';
const words: StepWords = STEP_WORDS.table;
export const { label, hint, slots, outputs } = words;

export const mayBreak = false;

export const icon = '▦';

export function traceLine(t: any, h: any) {
  const rolls = t.rolls?.length ? `[${t.rolls.join(', ')}] = ` : '';
  const name = typeof h?.tableLabel === 'function' ? h.tableLabel(t.table) : t.table;
  const result = typeof t.result === 'string' && typeof h?.rowSaid === 'function' ? h.rowSaid(t.table, t.result) : t.result;
  return `таблица «${name}»: ${rolls}${t.value} → ${result}`;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

const runner: Pick<StepModule, 'finish'> = {
  finish(step, ctx) {
    const name = String(ctx.value(step.table) ?? '').trim();
    if (!name) throw new EngineError(`${who(ctx)}: шагу «таблица» не сказано, какую таблицу читать`);
    const rolls: number[] = [];
    let value: number;
    if (step.dice !== undefined && step.dice !== null) {
      const spec = diceOf(step.dice, ctx);
      if (!spec) throw new EngineError(`${who(ctx)}: шагу «таблица» нужен аргумент — число или кости`);
      const rolled = result(start(spec, [], ctx.die));
      rolls.push(...rolled.dice.rolls);
      value = rolled.total;
    } else if (step.value !== undefined && step.value !== null) {
      value = ctx.number(step.value, 'аргумент таблицы');
    } else {
      throw new EngineError(`${who(ctx)}: шагу «таблица» нужен аргумент — число или кости`);
    }
    const column = typeof step.column === 'string' && step.column ? step.column : VALUE_COLUMN;
    const found = readCell(ctx.system, ctx.here, name, value, column, ctx.owner);
    return { value: found, trace: { table: name, value, ...(rolls.length ? { rolls } : {}), result: found }, break: null };
  },
};


export const { finish } = runner;
