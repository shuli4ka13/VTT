import type { Sheet } from './types.ts';

type Loose = Record<string, unknown>;

const NAME = '[\\p{L}\\p{N}_]';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function renameText(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [from, to] of [...map].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`@((?:отправитель|получатель|стол)\\.)?${escape(from)}(?!${NAME})`, 'gu');
    out = out.replace(re, (_, owner: string | undefined) => `@${owner ?? ''}${to}`);
  }
  return out;
}

const EXACT_KEYS = new Set(['tag', 'target', 'field']);

export function renameDeep<T>(value: T, map: Map<string, string>, key?: string): T {
  if (typeof value === 'string') {
    if (key && EXACT_KEYS.has(key) && map.has(value)) return map.get(value) as T;
    if (value.startsWith('field:') && map.has(value.slice(6))) return `field:${map.get(value.slice(6))}` as T;
    return (value.includes('@') ? renameText(value, map) : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => renameDeep(item, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, renameDeep(v, map, k)])) as T;
  }
  return value;
}

export const renameValues = <S extends Pick<Sheet, 'values'>>(sheet: S, map: Map<string, string>): S => ({
  ...sheet,
  values: Object.fromEntries(Object.entries(sheet.values ?? {}).map(([k, v]) => [map.get(k) ?? k, v])),
});
