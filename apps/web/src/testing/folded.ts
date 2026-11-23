import type { Effect } from '@vtt/schema';

export const folded = (effect: Effect | undefined): Effect | undefined => {
  if (!effect) return effect;
  const copy = structuredClone(effect);
  const renames = new Map<string, string>();
  const find = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(find); return; }
    if (!value || typeof value !== 'object') return;
    const holder = value as Record<string, unknown>;
    if (typeof holder.type === 'string' && typeof holder.id === 'string' && typeof holder.label === 'string') {
      renames.set(holder.id, holder.label.trim().toLowerCase().replace(/\s+/g, '_'));
      delete holder.label;
    }
    Object.values(holder).forEach(find);
  };
  find(copy);
  const targets = new Set(renames.values());
  const apply = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(apply);
    if (typeof value === 'string') {
      return value.replace(/@([\p{L}\p{N}_]+)/gu, (whole, name: string) => (renames.has(name) && !targets.has(name) ? `@${renames.get(name)}` : whole));
    }
    if (!value || typeof value !== 'object') return value;
    const holder = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(holder).map(([key, inner]) => [key, key === 'id' && typeof inner === 'string' && renames.has(inner) ? renames.get(inner) : apply(inner)]));
  };
  return apply(copy) as Effect;
};
