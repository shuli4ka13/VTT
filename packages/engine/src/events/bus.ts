import { wornEffects, findEffect } from '../engine/effects.ts';
import type { System, Sheet, Compendium, Effect, Handler } from '../model/types.ts';

export const MOMENT_PREFIX = 'moment:';
export const FIELD_PREFIX = 'field:';
export const GAINED_PREFIX = 'gained:';
export const LOST_PREFIX = 'lost:';

export { PHASES, SEEN, SEEN_LABEL, ROLLED, ROLLED_LABEL, ANY_ACTION, isPhase, callHappening, happeningOf } from './happenings.ts';
export type { Phase } from './happenings.ts';

export interface Subscriber {
  id: string;
  effect: Effect;
  handler: Handler;
  index: number;
  key: string;
}

export const handlerKey = (id: string, index: number): string => (index ? `${id}#${index}` : id);

export const asks = (handler: Handler): boolean => handler.confirm === true;

export const handlersOf = (effect: Effect | null | undefined): Handler[] => effect?.on ?? [];

export function subscribers(
  system: System, sheet: Sheet, { compendium }: { compendium?: Compendium | null } = {},
): Subscriber[] {
  return wornEffects(system, sheet, { strict: false, compendium }).flatMap(({ id, effect }) => handlersOf(effect).map((handler, index) => ({
    id, effect, handler, index, key: handlerKey(id, index),
  })));
}

export function subscriberByKey(system: System, key: string): Subscriber | null {
  const hash = key.lastIndexOf('#');
  const id = hash > 0 ? key.slice(0, hash) : key;
  const index = hash > 0 ? Number(key.slice(hash + 1)) : 0;
  const effect = findEffect(system, id);
  const handler = handlersOf(effect)[index];
  return effect && handler ? { id, effect, handler, index, key } : null;
}

export const withSteps = (effect: Effect, steps: Handler['steps']): Effect => ({ ...effect, steps: steps ?? [] });
