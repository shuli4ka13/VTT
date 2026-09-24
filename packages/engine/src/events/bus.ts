import { wornEffects, findEffect } from '../engine/effects.ts';
import type { System, Sheet, Compendium, Effect, Handler } from '../model/types.ts';
import type { EmittedEvent } from '../engine/rule.ts';

export const EVENT_PREFIX = 'event:';
export const MOMENT_PREFIX = 'moment:';
export const FIELD_PREFIX = 'field:';

export type Role = 'target' | 'sender';
export type Phase = 'before' | 'after';

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
  | { kind: 'action'; role: Role; phase: Phase; ask: boolean; effect: string; emitted: EmittedEvent[] };

export const handlerKey = (id: string, index: number): string => (index ? `${id}#${index}` : id);

export const roleOf = (handler: Handler): Role => handler.role ?? 'target';
export const phaseOf = (handler: Handler): Phase => handler.phase ?? 'after';
export const asks = (handler: Handler): boolean => handler.ask === true;
export const runsAtOther = (handler: Handler): boolean => handler.to === 'other';

export const handlersOf = (effect: Effect | null | undefined): Handler[] => effect?.on ?? [];

export function hears(on: string, effectId: string, emitted: EmittedEvent[]): EmittedEvent | undefined | null {
  if (on === '*') return undefined;
  if (on.startsWith(EVENT_PREFIX)) return emitted.filter(e => `${EVENT_PREFIX}${e.event}` === on).at(-1) ?? null;
  if (on.startsWith(MOMENT_PREFIX) || on.startsWith(FIELD_PREFIX)) return null;
  return on === effectId ? undefined : null;
}

export function subscribers(
  system: System, sheet: Sheet, { compendium, room = true }: { compendium?: Compendium | null; room?: boolean } = {},
): Subscriber[] {
  const worn = wornEffects(system, sheet, { strict: false, compendium });
  const wornIds = new Set(worn.map(w => w.id));
  const rules = room
    ? (system.room_rules ?? [])
      .filter(id => !wornIds.has(id))
      .map(id => ({ id, effect: findEffect(system, id) }))
      .filter((entry): entry is { id: string; effect: Effect } => Boolean(entry.effect))
    : [];
  return [...worn, ...rules].flatMap(({ id, effect }) => handlersOf(effect).map((handler, index) => ({
    id, effect, handler, index, key: handlerKey(id, index),
  })));
}

export interface Heard extends Subscriber { heard?: EmittedEvent }

export function listening(
  system: System, sheet: Sheet, occasion: Occasion, options: { compendium?: Compendium | null; room?: boolean } = {},
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
    if (roleOf(handler) !== occasion.role || phaseOf(handler) !== occasion.phase || asks(handler) !== occasion.ask) continue;
    const heard = hears(handler.on, occasion.effect, occasion.emitted);
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
