import { packRef, resolveNumber } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'compare';
export const label = 'Сравнение';
export const hint = 'Величина против поля цели. Не дотянула — цепочка обрывается.';

const BREAKS: Record<string, (margin: number) => boolean> = {
  less: margin => margin < 0,
  atMost: margin => margin <= 0,
  never: () => false,
};

export const slots = [
  { key: 'value', label: 'Величина', kind: 'ref' },
  { key: 'versus', label: 'Против', kind: 'ref' },
  { key: 'breakIf', label: 'Обрыв когда', kind: 'choice', options: Object.keys(BREAKS) },
];

export const outputs = [
  { path: '.margin', label: 'разница', kind: 'number' },
];

export const mayBreak = true;

export function breakLine(step: StepData) {
  const words: Record<string, string> = {
    less: 'если величина меньше порога — не пробило',
    atMost: 'если величина не выше порога — не пробило',
  };
  return words[String(step.breakIf || 'less')] || null;
}

export function reasonWord(reason: string): string | null {
  return reason === 'compare-short' ? 'не пробило' : null;
}

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
      versus: step.versus && typeof step.versus === 'object' && 'tag' in step.versus
        ? { tag: step.versus.tag, value: versus }
        : { value: versus },
      margin, passed: !broke,
    },
    break: broke ? { reason: 'compare-short' } : null,
  };
}
