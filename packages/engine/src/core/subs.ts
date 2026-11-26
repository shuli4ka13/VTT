import { wornEffects } from '../engine/effects.ts';
import { handlerKey, handlersOf } from '../events/bus.ts';
import type { System, Sheet, Compendium, Effect, Handler, WornEffect } from '../model/types.ts';
import type { ItemRef } from '../model/item-ref.ts';
import type { GrantArgs } from '../model/grants.ts';

export interface Sub {
  sheetId: string;
  effectId: string;
  effect: Effect;
  handler: Handler;
  key: string;
  inst: string;
  entry: WornEffect;
  item?: ItemRef;
  given?: GrantArgs;
}

export function instOf(entry: WornEffect, granted: boolean, nth: number): string {
  const own = (entry as { inst?: unknown }).inst;
  if (typeof own === 'string' && own) return own;
  return granted ? `+${entry.effectId}` : `${entry.effectId}@${nth}`;
}

export type InstOf = (entry: WornEffect, granted: boolean, nth: number) => string;

export function subsOf(system: System, sheet: Sheet, compendium: Compendium | null, inst: InstOf = instOf): Sub[] {
  const seen = new Map<string, number>();
  const attached = new Set(sheet.effects ?? []);
  return wornEffects(system, sheet, { strict: false, compendium }).flatMap(({ id, effect, entry, item, args }) => {
    const nth = seen.get(id) ?? 0;
    seen.set(id, nth + 1);
    const own = inst(entry, !attached.has(entry), nth);
    return handlersOf(effect).map((handler, index): Sub => ({
      sheetId: sheet.id, effectId: id, effect, handler, key: handlerKey(id, index), inst: own, entry,
      ...(item ? { item, given: args ?? {} } : {}),
    }));
  });
}

export { ANY_ACTION } from '../events/happenings.ts';
import { ANY_ACTION } from '../events/happenings.ts';

export function tagsOf(system: System, effectId: string): string[] {
  const out: string[] = [];
  const visit = (tag: string): void => {
    if (out.includes(tag)) return;
    out.push(tag);
    for (const included of system.tags?.[tag]?.includes ?? []) visit(included);
  };
  for (const tag of system.effects[effectId]?.tags ?? []) visit(tag);
  return out;
}

export function keysOf(system: System, effectId: string, top: boolean): string[] {
  return [effectId, ...tagsOf(system, effectId), ...(top ? [ANY_ACTION] : [])];
}

export const same = (a: Sub, b: Sub): boolean => a.inst === b.inst && a.key === b.key;
