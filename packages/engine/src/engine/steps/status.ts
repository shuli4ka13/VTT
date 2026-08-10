// Шаг «состояние»: повесить эффект на цель — или снять его.
//
// Полей не трогает: само по себе состояние ничего не меняет, меняют его
// модификаторы при следующем пересчёте (отравление даёт помеху, пока висит).
//
// Два направления одного шага, а не два типа шагов: лечащее заклинание
// снимает яд тем же конвейером, каким атакующее его наложило. Что делать
// при повторном наложении, решает сам эффект (ось «стакинг») — за этим
// следит ядро (ctx.attach), шагу это знать не нужно.

import { packRef, resolveRef } from '../refs.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';

export const type = 'status';
export const label = 'Состояние';
export const hint = 'Повесить эффект на цель или снять его.';

export const MODES = {
  apply: { label: 'Наложить' },
  remove: { label: 'Снять' },
};

export const slots = [
  { key: 'mode', label: 'Что делаем', kind: 'choice', choices: MODES },
  { key: 'effect', label: 'Эффект', kind: 'ref' },
];

export const outputs = [];

export const mayBreak = false;

export const icon = '☄';

export function traceLine(t: any, h: any) {
  if (t.effect === null) return 'состояние: не задано — шаг пропущен';
  return t.mode === 'remove'
    ? `состояние: снято «${h.effectLabel(t.effect)}»`
    : `состояние: наложено «${h.effectLabel(t.effect)}»`;
}

export function pack(step: StepData, ctx: StepContext) {
  return { mode: modeOf(step, ctx), effect: packRef(step.effect, ctx) };
}

export function resolve(step: StepData, ctx: StepContext) {
  const mode = modeOf(step, ctx);
  const id = resolveRef(step.effect, ctx);

  // Пустой слот — законная пустота, объявленная в данных: заклинание без
  // состояния при провале заполняет свойство пустым, и шаг честно молчит.
  if (id === null || id === undefined || id === '') {
    return { value: null, trace: { mode, effect: null }, break: null };
  }
  if (typeof id !== 'string') {
    throw new EngineError(
      `${ctx.owner || 'правило'}: состоянию нужен id эффекта, а пришло ${JSON.stringify(id)}`);
  }

  if (mode === 'remove') ctx.detach!(id);
  else ctx.attach!(id);

  return { value: id, trace: { mode, effect: id }, break: null };
}

function modeOf(step: StepData, ctx: StepContext): string {
  const mode = String(step.mode || 'apply');
  if (!(mode in MODES)) {
    throw new EngineError(
      `${ctx.owner || 'правило'}: у шага «состояние» нет режима «${mode}»; умею ${Object.keys(MODES).join(', ')}`);
  }
  return mode;
}
