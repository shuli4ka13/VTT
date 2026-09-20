import { actionOf } from '../events/envelope.ts';
import type { System, Compendium, Ask, Param } from './types.ts';

export interface AskedParam extends Param {
  ask: Ask;
  effect: string;
  effectLabel: string;
}

export function asksOf(actionId: string, { system, compendium }: { system: System; compendium: Compendium }): AskedParam[] {
  const action = actionOf(actionId, { system, compendium });
  const effect = system.effects[action.effect];
  if (!effect) return [];
  const bound = action.binding.args ?? {};
  return (effect.params ?? [])
    .filter((param): param is Param & { ask: Ask } => Boolean(param.ask))
    .filter(param => bound[param.key] === undefined)
    .map(param => ({ ...param, effect: action.effect, effectLabel: effect.label ?? action.effect }));
}

export function checkInputs(asked: AskedParam[], inputs: Record<string, number | string> | undefined): string | null {
  const given = inputs ?? {};
  for (const key of Object.keys(given)) {
    if (!asked.some(param => param.key === key)) return `лишнее значение «${key}» — действие о нём не спрашивает`;
  }
  for (const param of asked) {
    const value = given[param.key];
    const name = param.label ?? param.key;
    if (value === undefined || value === '') return `не заполнено: ${name}`;
    const kind = param.ask.kind ?? 'number';
    if (kind === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)) return `${name}: нужно число, а пришло «${value}»`;
      if (param.ask.min !== undefined && number < param.ask.min) return `${name}: не меньше ${param.ask.min}`;
      if (param.ask.max !== undefined && number > param.ask.max) return `${name}: не больше ${param.ask.max}`;
    }
    if (kind === 'choice') {
      const options = param.ask.options ?? [];
      if (!options.includes(String(value))) {
        return `${name}: можно только ${options.map((option: string) => `«${option}»`).join(', ') || '(список пуст)'}`;
      }
    }
  }
  return null;
}

export const normalizeInputs = (
  asked: AskedParam[], inputs: Record<string, number | string> | undefined,
): Record<string, number | string> => {
  const out: Record<string, number | string> = {};
  for (const param of asked) {
    const value = (inputs ?? {})[param.key];
    if (value === undefined) continue;
    out[param.key] = (param.ask.kind ?? 'number') === 'number' ? Number(value) : String(value);
  }
  return out;
};
