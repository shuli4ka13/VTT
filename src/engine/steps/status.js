// Шаг «состояние»: повесить эффект компендиума на цель. Полей не трогает —
// само по себе состояние ничего не меняет, меняют его модификаторы при
// следующем пересчёте (отравление даёт помеху, пока висит).
//
// Повторное наложение не дублирует: за этим следит ядро (ctx.attach).

import { packRef, resolveRef } from '../refs.js';
import { EngineError } from '../errors.js';

export const type = 'status';
export const label = 'Состояние';
export const hint = 'Повесить эффект на цель.';

export const slots = [
  { key: 'effect', label: 'Эффект', kind: 'ref' },
];

export const outputs = [];

export const mayBreak = false;

export const icon = '☄';

export function traceLine(t, h) {
  return `состояние: наложено «${h.effectLabel(t.effect)}»`;
}

export function pack(step, ctx) {
  return { effect: packRef(step.effect, ctx) };
}

export function resolve(step, ctx) {
  const id = resolveRef(step.effect, ctx);
  if (typeof id !== 'string' || !id) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
  }
  ctx.attach(id);
  return { value: id, trace: { effect: id }, break: null };
}
