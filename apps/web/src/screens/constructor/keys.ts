import { slugOf, freeId } from '../../store/world.ts';
import { usageIndex, inUse } from './usage.ts';
import type { System, Compendium } from '@vtt/schema';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function referenced(world: unknown, key: string, own: unknown = world): boolean {
  if (JSON.stringify(own).split(`"${key}"`).length - 1 > 1) return true;
  return new RegExp(`[@#]${escape(key)}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(world));
}

export function effectUsed(system: System, compendium: Compendium | undefined, id: string): boolean {
  const index = usageIndex(system, compendium);
  return inUse(index, 'effect', id) || inUse(index, 'event', id);
}

function passesArg(node: unknown, effectId: string, key: string): boolean {
  if (Array.isArray(node)) return node.some(item => passesArg(item, effectId, key));
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (o.effect === effectId && o.args && typeof o.args === 'object' && key in (o.args as object)) return true;
  return Object.values(o).some(value => passesArg(value, effectId, key));
}

export function paramUsed(system: System, compendium: Compendium | undefined, effectId: string, key: string): boolean {
  const own = system.effects[effectId];
  if (own && referenced(own, key)) return true;
  return passesArg(system, effectId, key) || passesArg(compendium, effectId, key);
}

export function looksAuto(key: string, base: string, label: string): boolean {
  const pattern = (word: string) => new RegExp(`^${escape(slugOf(word))}(_\\d+)?$`, 'u');
  return pattern(base).test(key) || (Boolean(slugOf(label)) && pattern(label).test(key));
}

export function followKey({ used, key, base, before, after, taken }: {
  used: boolean; key: string; base: string; before: string; after: string; taken: Iterable<string>;
}): string {
  if (!slugOf(after) || !looksAuto(key, base, before) || used) return key;
  return freeId([...taken].filter(other => other !== key), after);
}

export const keyOf = (text: string): string => slugOf(text);
