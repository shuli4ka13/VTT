import { packRef, resolveNumber } from '../refs.ts';
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
  return {
    value: packRef(step.value, ctx),
    versus: packRef(step.versus, ctx),
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
      ...(step.value && typeof step.value === 'object' && 'tag' in step.value ? { of: step.value.tag } : {}),
      versus: step.versus && typeof step.versus === 'object' && 'tag' in step.versus
        ? { tag: step.versus.tag, value: versus }
        : { value: versus },
      margin, passed: !broke,
    },
    break: broke ? { reason: 'compare-short', ...(step.note ? { note: String(step.note) } : {}) } : null,
  };
}
