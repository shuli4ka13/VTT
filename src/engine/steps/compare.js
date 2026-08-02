// Шаг «сравнение»: сопоставить величину с чем-то у цели. Может оборвать
// цепочку; разница доступна дальше по имени — киберпанк вычитает из хитов
// именно её (величина − броня), а не исходную величину.
//
// Обрыв здесь и обрыв на пороге — РАЗНЫЕ записи в журнале:
// compare-short против threshold-miss. «Не попал» и «попал, но броня
// не пробита» — разные истории, и игрок должен видеть, которая случилась.

import { packRef, resolveNumber } from '../refs.js';
import { EngineError } from '../errors.js';

export const type = 'compare';
export const label = 'Сравнение';
export const hint = 'Величина против поля цели. Не дотянула — цепочка обрывается.';

const BREAKS = {
  less: margin => margin < 0,      // строго меньше порога — обрыв (равенство проходит)
  atMost: margin => margin <= 0,   // не выше порога — обрыв (равенство тоже рвёт)
  never: () => false,              // сравнение только ради разницы, без обрыва
};

export const slots = [
  { key: 'value', label: 'Величина', kind: 'ref' },
  { key: 'versus', label: 'Против', kind: 'ref' },
  { key: 'breakIf', label: 'Обрыв когда', kind: 'choice', options: Object.keys(BREAKS) },
];

export const outputs = [
  { path: '.margin', label: 'разница' },
];

export const mayBreak = true;

export function traceLine(t, h) {
  const versusName = t.versus.tag ? `${h.labelOf(t.versus.tag)} ` : '';
  return `сравнение: ${t.value} против ${versusName}${t.versus.value} — `
    + (t.passed ? `прошло (разница ${t.margin})` : `не прошло (${t.margin})`);
}

export function pack(step, ctx) {
  const breakIf = step.breakIf || 'less';
  if (!BREAKS[breakIf]) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: неизвестное условие обрыва «${breakIf}» — умею: ${Object.keys(BREAKS).join(', ')}`);
  }
  return {
    value: packRef(step.value, ctx),
    versus: packRef(step.versus, ctx),
    breakIf,
  };
}

export function resolve(step, ctx) {
  const value = resolveNumber(step.value, ctx, 'сравниваемая величина');
  const versus = resolveNumber(step.versus, ctx, 'сравнению не с чем сопоставить величину');
  const margin = value - versus;
  const broke = BREAKS[step.breakIf](margin);

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
