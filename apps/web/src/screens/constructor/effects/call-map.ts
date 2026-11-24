import { chainsOfEffect, emittedChoices, listenerOf, effectTags } from '@vtt/engine';
import type { System, Effect } from '@vtt/schema';

export interface CallMap {
  calls: string[];
  usedBy: { id: string; book: boolean }[];
  heardBy: string[];
}

export function callsOf(system: System, id: string): string[] {
  const effect = system.effects?.[id];
  if (!effect) return [];
  const out = new Set<string>();
  for (const step of chainsOfEffect(effect).flat() as Record<string, unknown>[]) {
    if (step.type !== 'emit' || !step.effect) continue;
    for (const called of emittedChoices(system, id, step.effect)) {
      if (called !== id && system.effects?.[called]) out.add(called);
    }
  }
  return [...out];
}

const listens = (effect: Effect, keys: string[]): boolean =>
  (effect.on ?? []).some(handler => {
    const heard = listenerOf(handler);
    return heard.kind === 'call' && keys.includes(heard.key);
  });

export function callMap(system: System, id: string): CallMap {
  const usedBy: CallMap['usedBy'] = [];
  const heardBy: string[] = [];
  const keys = [id, ...effectTags(system, id)];
  for (const [other, effect] of Object.entries(system.effects ?? {})) {
    if (other === id) continue;
    if (callsOf(system, other).includes(id)) usedBy.push({ id: other, book: false });
    if (listens(effect, keys)) heardBy.push(other);
  }
  return { calls: callsOf(system, id), usedBy, heardBy };
}

export function bookEntriesOf(system: System, id: string): string[] {
  return bookButtonsOf(system, id).map(one => one.table);
}

export function bookButtonsOf(system: System, id: string): { key: string; table: string; button: string }[] {
  const out: { key: string; table: string; button: string }[] = [];
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    for (const binding of table.bindings ?? []) {
      if (binding.effect === id) out.push({ key, table: table.label || key, button: binding.label || '' });
    }
  }
  return out;
}
