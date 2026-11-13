export function plural(n: number, one: string, few: string, many: string): string {
  const tens = Math.abs(n) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

export const counted = (n: number, one: string, few: string, many: string): string => `${n} ${plural(n, one, few, many)}`;
