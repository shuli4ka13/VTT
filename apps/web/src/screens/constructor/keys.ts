import { slugOf, freeId } from '../../store/world.ts';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function referenced(world: unknown, key: string, own: unknown = world): boolean {
  if (JSON.stringify(own).split(`"${key}"`).length - 1 > 1) return true;
  return new RegExp(`[@#]${escape(key)}(?![\\p{L}\\p{N}_])`, 'u').test(JSON.stringify(world));
}

export function looksAuto(key: string, base: string, label: string): boolean {
  const pattern = (word: string) => new RegExp(`^${escape(slugOf(word))}(_\\d+)?$`, 'u');
  return pattern(base).test(key) || (Boolean(slugOf(label)) && pattern(label).test(key));
}

export function followKey({ world, key, base, before, after, taken }: {
  world: unknown; key: string; base: string; before: string; after: string; taken: Iterable<string>;
}): string {
  if (!slugOf(after) || !looksAuto(key, base, before) || referenced(world, key)) return key;
  return freeId([...taken].filter(other => other !== key), after);
}

export const keyOf = (text: string): string => slugOf(text);
