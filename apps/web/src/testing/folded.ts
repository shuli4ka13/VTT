import type { Effect } from '@vtt/schema';
import { latinOf } from '../store/world.ts';

const wordOf = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, '_');

export const folded = (effect: Effect | undefined): Effect | undefined => {
  if (!effect) return effect;
  const copy = structuredClone(effect);
  const renames = new Map<string, string>();
  const find = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(find); return; }
    if (!value || typeof value !== 'object') return;
    const holder = value as Record<string, unknown>;
    if (typeof holder.type === 'string' && typeof holder.id === 'string' && typeof holder.label === 'string') {
      renames.set(holder.id, wordOf(holder.label));
      delete holder.label;
    }
    if (typeof holder.key === 'string' && typeof holder.label === 'string' && typeof holder.type !== 'string') {
      renames.set(holder.key, wordOf(holder.label));
    }
    if (typeof holder.as === 'string' && typeof holder.asLabel === 'string') {
      renames.set(holder.as, wordOf(holder.asLabel));
      delete holder.asLabel;
    }
    Object.values(holder).forEach(find);
  };
  find(copy);
  const targets = new Set(renames.values());
  const renamed = (name: string): string => (renames.has(name) && !targets.has(name) ? renames.get(name)! : name);
  const apply = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(apply);
    if (typeof value === 'string') return value.replace(/@([\p{L}\p{N}_]+)/gu, (_whole, name: string) => `@${renamed(name)}`);
    if (!value || typeof value !== 'object') return value;
    const holder = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(holder).map(([key, inner]) => {
      if ((key === 'id' || key === 'as' || key === 'of') && typeof inner === 'string') return [key, renamed(inner)];
      if (key === 'group' && typeof inner === 'string') return [key, inner.toLowerCase()];
      if (key === 'key' && typeof inner === 'string' && renames.has(inner)) return [key, renamed(inner)];
      return [key, apply(inner)];
    }));
  };
  return apply(copy) as Effect;
};

export const foldedSystem = <T extends { effects?: Record<string, Effect> }>(system: T): T => {
  const copy = structuredClone(system);
  for (const [id, effect] of Object.entries(copy.effects ?? {})) copy.effects![id] = folded(effect)!;
  return JSON.parse(latinOf(JSON.stringify(copy))) as T;
};
