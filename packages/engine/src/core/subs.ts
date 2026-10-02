import { wornEffects } from '../engine/effects.ts';
import { handlerKey, handlersOf, EVENT_PREFIX, MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX } from '../events/bus.ts';
import type { EmittedEvent } from '../engine/rule.ts';
import type { System, Sheet, Compendium, Effect, Handler, WornEffect } from '../model/types.ts';

export interface Sub {
  sheetId: string;
  effectId: string;
  effect: Effect;
  handler: Handler;
  key: string;
  inst: string;
  entry: WornEffect;
}

export type ActionMoment = 'targeted' | 'affected' | 'acted' | 'done' | 'seen';

export type Hearing =
  | { kind: 'action'; moment: ActionMoment; level: 'action' | 'event' | 'any'; effect: string; emitted: readonly EmittedEvent[]; confirm: boolean; watch: boolean }
  | { kind: 'moment'; moment: string }
  | { kind: 'field'; tag: string }
  | { kind: 'gained'; effect: string }
  | { kind: 'lost'; effect: string };

export function instOf(entry: WornEffect, granted: boolean, nth: number): string {
  const own = (entry as { inst?: unknown }).inst;
  if (typeof own === 'string' && own) return own;
  return granted ? `+${entry.effectId}` : `${entry.effectId}@${nth}`;
}

export type InstOf = (entry: WornEffect, granted: boolean, nth: number) => string;

export function subsOf(system: System, sheet: Sheet, compendium: Compendium | null, inst: InstOf = instOf): Sub[] {
  const seen = new Map<string, number>();
  const attached = new Set(sheet.effects ?? []);
  return wornEffects(system, sheet, { strict: false, compendium }).flatMap(({ id, effect, entry }) => {
    const nth = seen.get(id) ?? 0;
    seen.set(id, nth + 1);
    const own = inst(entry, !attached.has(entry), nth);
    return handlersOf(effect).map((handler, index): Sub => ({
      sheetId: sheet.id, effectId: id, effect, handler, key: handlerKey(id, index), inst: own, entry,
    }));
  });
}

export function heard(sub: Sub, hearing: Hearing): { event?: EmittedEvent } | null {
  const { handler } = sub;
  if (hearing.kind === 'moment') return handler.on === `${MOMENT_PREFIX}${hearing.moment}` ? {} : null;
  if (hearing.kind === 'field') return handler.on === `${FIELD_PREFIX}${hearing.tag}` ? {} : null;
  if (hearing.kind === 'gained') return handler.on === `${GAINED_PREFIX}${hearing.effect}` ? {} : null;
  if (hearing.kind === 'lost') return handler.on === `${LOST_PREFIX}${hearing.effect}` ? {} : null;
  if (handler.on !== hearing.moment) return null;
  if ((handler.confirm === true) !== hearing.confirm) return null;
  if (Boolean(handler.watch) !== hearing.watch) return null;
  const of = handler.of;
  const onEvent = Boolean(of?.startsWith(EVENT_PREFIX));
  if (hearing.level === 'action' && onEvent) return null;
  if (hearing.level === 'event' && !onEvent) return null;
  if (!of) return {};
  if (onEvent) {
    const event = hearing.emitted.filter(e => `${EVENT_PREFIX}${e.event}` === of).at(-1);
    return event ? { event } : null;
  }
  return of === hearing.effect ? {} : null;
}

export const same = (a: Sub, b: Sub): boolean => a.inst === b.inst && a.key === b.key;
