import { packRef, resolveNumber, lonelyField } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';
import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'compare';
const words: StepWords = STEP_WORDS.compare;
export const { label, hint, slots, outputs } = words;

export function breakLine(step: StepData) {
  return words.breakLines[String(step.breakIf || 'less')] ?? null;
}

export function reasonWord(reason: string): string | null {
  return words.reasons[reason] ?? null;
}

const BREAKS: Record<string, (margin: number) => boolean> = {
  less: margin => margin < 0,
  atMost: margin => margin <= 0,
  never: () => false,
};

export const mayBreak = true;

export const icon = '⇄';

export function traceLine(t: any, h: any) {
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  return `сравнение: ${t.value} против ${versusName}${t.versus.value} — `
    + (t.passed ? `прошло (разница ${t.margin})` : `не прошло (${t.margin})`);
}

export function pack(step: StepData, ctx: StepContext) {
  const breakIf = step.breakIf || 'less';
  if (!BREAKS[String(breakIf)]) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: неизвестное условие обрыва «${breakIf}» — умею: ${Object.keys(BREAKS).join(', ')}`);
  }
  const of = lonelyField(step.value);
  const against = lonelyField(step.versus);
  return {
    value: packRef(step.value, ctx),
    versus: packRef(step.versus, ctx),
    ...(of ? { of } : {}),
    ...(against ? { against } : {}),
    breakIf,
    ...(typeof step.note === 'string' && step.note.trim() ? { note: step.note.trim() } : {}),
  };
}

export function resolve(step: StepData, ctx: StepContext) {
  const value = resolveNumber(step.value, ctx, 'сравниваемая величина');
  const versus = resolveNumber(step.versus, ctx, 'сравнению не с чем сопоставить величину');
  const margin = value - versus;
  const broke = BREAKS[String(step.breakIf)]!(margin);

  return {
    value: { margin, value, versus },
    trace: {
      value,
      ...(step.of ? { of: step.of } : {}),
      versus: step.against ? { tag: step.against, value: versus } : { value: versus },
      margin, passed: !broke,
    },
    break: broke ? { reason: 'compare-short', ...(step.note ? { note: String(step.note) } : {}) } : null,
  };
}
