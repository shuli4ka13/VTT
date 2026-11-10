import type { Step } from '@vtt/schema';

export function isThrow(step: Step): boolean {
  if (step.type !== 'roll') return false;
  const it = step as { by?: unknown; field?: unknown };
  const set = (value: unknown): boolean => value !== undefined && value !== null;
  return set(it.field) || set(it.by);
}
