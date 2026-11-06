import type { RollEdit } from './types.ts';

export function cancels(dictionary: Record<string, RollEdit>, a: string, b: string): boolean {
  return a !== b && Boolean(dictionary[a]?.cancels?.includes(b) || dictionary[b]?.cancels?.includes(a));
}
