import { EngineError } from '../errors.ts';
import { lookupDegree } from '../tables.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, forcedWords, type StepWords } from '../../words/steps.ts';

export const type = 'check';
const words: StepWords = STEP_WORDS.check;
export const { label, hint, slots, outputs } = words;

export const mayBreak = true;

export const icon = '⌖';

export function breakLine(step: StepData) {
  return words.breakLines[String(step.continueOn || 'success')] ?? null;
}

export function reasonWord(reason: string): string | null {
  return words.reasons[reason] ?? null;
}

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),
  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

const who = (ctx: StepContext): string => ctx.owner || 'правило';

const loneName = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object' || !('expr' in ref)) return null;
  const found = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr: unknown }).expr));
  return found ? found[1]! : null;
};

function rollOf(ref: unknown, ctx: StepContext): Record<string, any> | null {
  const name = loneName(ref);
  return name ? ctx.rolled(name) : null;
}

export function finish(step: StepData, ctx: StepContext) {
  const total = ctx.number(step.value, 'что проверяем');
  const roll = rollOf(step.value, ctx);
  const successWhen = OUTCOMES[String(step.successWhen)] ? String(step.successWhen) : 'atLeast';
  const shift = Number(roll?.versusShift ?? 0);
  const eased = successWhen === 'notOver' || successWhen === 'under' ? -shift : shift;
  const raw = ctx.number(step.versus, 'проверке не с чем сравнить');
  const versus = raw + eased;
  const judged = OUTCOMES[successWhen]!(total, versus);
  const succeedOn = ctx.optional(step.succeedOn, 'кость верного успеха');
  const failOn = ctx.optional(step.failOn, 'кость верного провала');
  const natural = roll ? Number(roll.natural) : null;
  if ((succeedOn !== null || failOn !== null) && natural === null) {
    throw new EngineError(`${who(ctx)}: «всегда успех / провал на кости» требует проверять бросок — укажите шаг броска: @имя`);
  }
  const forced = natural === null ? null : failOn !== null && natural <= failOn ? false : succeedOn !== null && natural >= succeedOn ? true : null;
  const success = forced ?? judged.success;
  const scale = step.degrees && step.degrees.table ? step.degrees : null;
  const degree = scale
    ? lookupDegree(ctx.system, scale.table, scale.of === 'margin' ? judged.margin : total, Number(roll?.degreeShift ?? 0), ctx.owner)
    : null;
  const noteRaw = step.note && typeof step.note === 'object' ? ctx.value(step.note) : step.note;
  const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
  const goOn = step.continueOn === 'always' ? true : step.continueOn === 'fail' ? !success : success;
  return {
    value: {
      success, margin: judged.margin, total, versus,
      ...(roll ? { natural, rolled: roll.rolled, atMax: roll.atMax, atMin: roll.atMin, edited: roll.edited, dice: roll.dice, parts: roll.parts } : {}),
      ...(scale ? { degree } : {}),
    },
    trace: {
      total, versus, margin: judged.margin, success,
      ...(forced !== null ? { forced: natural } : {}),
      ...(scale ? { degree } : {}),
    },
    break: goOn ? null : { reason: step.continueOn === 'fail' ? 'check-held' : 'check-miss', ...(note ? { note } : {}) },
  };
}

export function lint(step: StepData) {
  if (step.value === undefined) return 'проверке нужно, что проверять';
  if (step.versus === undefined) return 'проверке нужен порог';
  return null;
}

export function traceLine(t: any) {
  const taken = t.forced != null ? `${t.success ? 'вышло' : 'не вышло'} (${forcedWords(t.forced, t.success)})`
    : t.success ? `вышло (запас ${t.margin})` : `не вышло (недобор ${-t.margin})`;
  const verdict = t.degree !== undefined && t.degree !== null ? `${taken}, степень ${t.degree}` : taken;
  return `проверка: ${t.total} с ${t.versus} — ${verdict}`;
}
