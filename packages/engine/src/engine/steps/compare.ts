import { EngineError } from '../errors.ts';
import { lonelyField } from '../refs.ts';
import type { StepData, StepContext, StepModule } from './index.ts';
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


export const icon = '⇄';

export function traceLine(t: any, h: any) {
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  return `сравнение: ${t.value} против ${versusName}${t.versus.value} — `
    + (t.passed ? `прошло (разница ${t.margin})` : `не прошло (${t.margin})`);
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';

const runner: Pick<StepModule, 'once' | 'mayBreak' | 'prepare' | 'finish' | 'splits'> = {
  mayBreak: true,
  finish(step, ctx) {
    const breakIf = String(step.breakIf || 'less');
    if (!BREAKS[breakIf]) throw new EngineError(`${who(ctx)}: неизвестное условие обрыва «${breakIf}» — умею: ${Object.keys(BREAKS).join(', ')}`);
    const value = ctx.number(step.value, 'сравниваемая величина');
    const versus = ctx.number(step.versus, 'сравнению не с чем сопоставить величину');
    const margin = value - versus;
    const broke = BREAKS[breakIf]!(margin);
    const of = lonelyField(step.value, ctx.system);
    const against = lonelyField(step.versus, ctx.system);
    const noteRaw = step.note && typeof step.note === 'object' ? ctx.value(step.note) : step.note;
    const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
    return {
      value: { margin, value, versus },
      trace: {
        value, ...(of ? { of } : {}),
        versus: against ? { tag: against, value: versus } : { value: versus },
        margin, passed: !broke,
      },
      break: broke ? { reason: 'compare-short', ...(note ? { note } : {}) } : null,
    };
  },
};


export const { mayBreak, finish } = runner;
