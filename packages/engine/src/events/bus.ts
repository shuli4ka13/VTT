import { wornEffects, findEffect } from '../engine/effects.ts';
import type { System, Sheet, Compendium, Effect, Handler } from '../model/types.ts';
import type { EmittedEvent } from '../engine/rule.ts';

export const EVENT_PREFIX = 'event:';
export const MOMENT_PREFIX = 'moment:';
export const FIELD_PREFIX = 'field:';
export const GAINED_PREFIX = 'gained:';
export const LOST_PREFIX = 'lost:';

export const ACTION_MOMENTS = {
  acting: { label: 'я действую — до того, как уйдёт цели', side: 'sender', before: true },
  acted: { label: 'я подействовал на цель', side: 'sender', before: false },
  targeted: { label: 'на меня действуют — до того, как решится', side: 'target', before: true },
  affected: { label: 'на меня подействовали', side: 'target', before: false },
} as const;

export type ActionMoment = keyof typeof ACTION_MOMENTS;

export const isActionMoment = (on: string | undefined): on is ActionMoment =>
  Boolean(on && Object.prototype.hasOwnProperty.call(ACTION_MOMENTS, on));

export interface Subscriber {
  id: string;
  effect: Effect;
  handler: Handler;
  index: number;
  key: string;
}

export type Occasion =
  | { kind: 'moment'; moment: string }
  | { kind: 'field'; tag: string }
  | { kind: 'gained'; effect: string }
  | { kind: 'lost'; effect: string }
  | { kind: 'action'; moment: ActionMoment; confirm: boolean; effect: string; emitted: EmittedEvent[] };

export const handlerKey = (id: string, index: number): string => (index ? `${id}#${index}` : id);

export const asks = (handler: Handler): boolean => handler.confirm === true;
export const runsAtOther = (handler: Handler): boolean => handler.to === 'other';

export const handlersOf = (effect: Effect | null | undefined): Handler[] => effect?.on ?? [];

export function hears(of: string | undefined, effectId: string, emitted: EmittedEvent[]): EmittedEvent | undefined | null {
  if (!of) return undefined;
  if (of.startsWith(EVENT_PREFIX)) return emitted.filter(e => `${EVENT_PREFIX}${e.event}` === of).at(-1) ?? null;
  return of === effectId ? undefined : null;
}

export function subscribers(
  system: System, sheet: Sheet, { compendium }: { compendium?: Compendium | null } = {},
): Subscriber[] {
  return wornEffects(system, sheet, { strict: false, compendium }).flatMap(({ id, effect }) => handlersOf(effect).map((handler, index) => ({
    id, effect, handler, index, key: handlerKey(id, index),
  })));
}

export interface Heard extends Subscriber { heard?: EmittedEvent }

export function listening(
  system: System, sheet: Sheet, occasion: Occasion, options: { compendium?: Compendium | null } = {},
): Heard[] {
  const out: Heard[] = [];
  for (const sub of subscribers(system, sheet, options)) {
    const { handler } = sub;
    if (occasion.kind === 'moment') {
      if (handler.on === `${MOMENT_PREFIX}${occasion.moment}`) out.push(sub);
      continue;
    }
    if (occasion.kind === 'field') {
      if (handler.on === `${FIELD_PREFIX}${occasion.tag}`) out.push(sub);
      continue;
    }
    if (occasion.kind === 'gained' || occasion.kind === 'lost') {
      const prefix = occasion.kind === 'gained' ? GAINED_PREFIX : LOST_PREFIX;
      if (handler.on === `${prefix}${occasion.effect}`) out.push(sub);
      continue;
    }
    if (handler.on !== occasion.moment || asks(handler) !== occasion.confirm) continue;
    const heard = hears(handler.of, occasion.effect, occasion.emitted);
    if (heard === null) continue;
    out.push(heard ? { ...sub, heard } : sub);
  }
  return out;
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
