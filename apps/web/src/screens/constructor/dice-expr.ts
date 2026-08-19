import type { DiceTerm } from '@vtt/schema';

export function diceCount(dice: DiceTerm[] | undefined): number | null {
  let total = 0;
  for (const term of dice ?? []) {
    const count = term.count ?? 1;
    if (typeof count !== 'number') return null;
    total += count;
  }
  return total;
}
