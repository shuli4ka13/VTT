import { hasField } from '../../model/sheet-columns.ts';
import { EngineError } from '../errors.ts';
import { lookupDegree } from '../tables.ts';
import { SUCCESS_NAME, MARGIN_NAME } from '../check.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, forcedWords, type StepWords } from '../../words/steps.ts';
import { facedText } from '../../core/against.ts';
import type { FacedTrace } from '../../core/against.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'check';
const words: StepWords = STEP_WORDS.check;
export const { label, hint, slots, outputs } = words;

export const mayBreak = false;

export const icon = '⌖';

export const slotNames = (step: StepData, slot: string): readonly string[] =>
  (slot === 'degrees' && Array.isArray(step.degrees) ? [SUCCESS_NAME, MARGIN_NAME] : []);

export const compares = (step: StepData): { value: unknown; versus: unknown } => ({ value: step.value, versus: step.versus });

const OUTCOMES: Record<string, (total: number, versus: number) => { success: boolean; margin: number }> = {
  atLeast: (total, versus) => ({ success: total >= versus, margin: total - versus }),
  notOver: (total, versus) => ({ success: total <= versus, margin: versus - total }),
  over: (total, versus) => ({ success: total > versus, margin: total - versus }),
  under: (total, versus) => ({ success: total < versus, margin: versus - total }),
  equals: (total, versus) => ({ success: total === versus, margin: -Math.abs(total - versus) }),
};

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

const loneName = (ref: unknown): string | null => {
  if (!ref || typeof ref !== 'object' || !('expr' in ref)) return null;
  const found = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr: unknown }).expr));
  return found ? found[1]! : null;
};

function rollOf(ref: unknown, ctx: StepContext): Record<string, any> | null {
  const name = loneName(ref);
  return name ? ctx.rolled(name) : null;
}

function fieldOfRef(ref: unknown, ctx: StepContext): string | null {
  if (!ref || typeof ref !== 'object' || !('expr' in ref)) return null;
  if (!/^\s*@[\p{L}\p{N}_.]+\s*$/u.test(String((ref as { expr: unknown }).expr))) return null;
  try {
    const tag = ctx.field(ref).tag;
    return hasField(ctx.system, tag) ? tag : null;
  } catch {
    return null;
  }
}

function facedOf(ref: unknown, other: unknown, ctx: StepContext) {
  const name = loneName(ref);
  return name ? ctx.faced?.(name, other) ?? null : null;
}

export function finish(step: StepData, ctx: StepContext) {
  const mine = facedOf(step.value, step.versus, ctx);
  const theirs = facedOf(step.versus, step.value, ctx);
  const total = mine ? mine.total : ctx.number(step.value, tr`что проверяем`);
  const roll = mine ? (mine.made as unknown as Record<string, any>) : rollOf(step.value, ctx);
  const successWhen = step.successWhen === undefined ? 'atLeast' : String(step.successWhen);
  if (!OUTCOMES[successWhen]) throw new EngineError(tr`${who(ctx)}: неизвестный вид сравнения «${successWhen}» — умею: ${Object.keys(OUTCOMES).join(', ')}`);
  const shift = Number(roll?.versusShift ?? 0);
  const eased = successWhen === 'notOver' || successWhen === 'under' ? -shift : shift;
  const raw = theirs ? theirs.total : ctx.number(step.versus, tr`проверке не с чем сравнить`);
  const versus = raw + eased;
  const judged = OUTCOMES[successWhen]!(total, versus);
  const succeedOn = ctx.optional(step.succeedOn, tr`кость верного успеха`);
  const failOn = ctx.optional(step.failOn, tr`кость верного провала`);
  const natural = roll ? Number(roll.natural) : null;
  if ((succeedOn !== null || failOn !== null) && natural === null) {
    throw new EngineError(tr`${who(ctx)}: «всегда успех / провал на кости» требует проверять бросок — укажите шаг броска по его имени`);
  }
  const forced = natural === null ? null : failOn !== null && natural <= failOn ? false : succeedOn !== null && natural >= succeedOn ? true : null;
  const doomed = step.failIf !== undefined && step.failIf !== null && step.failIf !== '' && ctx.holds(step.failIf);
  const granted = doomed ? null : ctx.optional(step.passWith, tr`запас верного успеха`);
  const ruled = doomed ? tr`провал` : granted !== null ? tr`успех` : null;
  if (granted !== null) judged.margin = granted;
  const success = doomed ? false : granted !== null ? true : forced ?? judged.success;
  const listed: { label: string; if: unknown }[] | null = Array.isArray(step.degrees) ? step.degrees : null;
  const scale = !listed && step.degrees && step.degrees.table ? step.degrees : null;
  const graded = listed ? ctx.naming({ [SUCCESS_NAME]: success, [MARGIN_NAME]: judged.margin + (granted === null ? Number(roll?.degreeShift ?? 0) : 0) }) : null;
  const degree = scale
    ? lookupDegree(ctx.system, scale.table, scale.of === 'margin' ? judged.margin : total, Number(roll?.degreeShift ?? 0), ctx.owner)
    : listed ? listed.find(one => graded!.holds(one.if))?.label ?? null : null;
  const ranked = scale !== null || listed !== null;
  const of = fieldOfRef(step.value, ctx);
  const against = fieldOfRef(step.versus, ctx);
  return {
    value: {
      success, margin: judged.margin, total, versus,
      ...(roll ? { natural, rolled: roll.rolled, atMax: roll.atMax, atMin: roll.atMin, edited: roll.edited, dice: roll.dice, parts: roll.parts } : {}),
      ...(ranked ? { degree } : {}),
    },
    trace: {
      total, versus, margin: judged.margin, success, value: total, ...(of ? { of } : {}), ...(against ? { versusTag: against } : {}),
      ...(roll && Array.isArray(roll.tags) && roll.tags.length ? { tags: roll.tags } : {}),
      ...(forced !== null && !ruled ? { forced: natural } : {}),
      ...(ruled ? { ruled } : {}),
      ...(ranked ? { degree } : {}),
      ...(mine || theirs ? { faced: [mine?.trace, theirs?.trace].filter(Boolean) } : {}),
    },
    break: null,
  };
}

export function lint(step: StepData) {
  if (step.value === undefined) return tr`проверке нужно, что проверять`;
  if (step.versus === undefined) return tr`проверке нужен порог`;
  if (Array.isArray(step.degrees) && step.degrees.some((one: { label?: unknown; if?: unknown }) => !one || !one.label || one.if === undefined || one.if === null)) return tr`у ступени проверки нужны название и условие`;
  return null;
}

export function traceLine(t: any) {
  const taken = t.ruled ? tr`${t.success ? tr`вышло` : tr`не вышло`} (по правилу — ${t.ruled})`
    : t.forced != null ? `${t.success ? tr`вышло` : tr`не вышло`} (${forcedWords(t.forced, t.success)})`
    : t.success ? tr`вышло (запас ${t.margin})` : tr`не вышло (недобор ${-t.margin})`;
  const verdict = t.degree !== undefined && t.degree !== null ? tr`${taken}, степень ${t.degree}` : taken;
  return tr`${facedWords(t.faced)}проверка: ${t.total} с ${t.versus} — ${verdict}`;
}

function facedWords(list: unknown): string {
  if (!Array.isArray(list) || !list.length) return '';
  return (list as FacedTrace[]).map(one => `${facedText(one)}; `).join('');
}
