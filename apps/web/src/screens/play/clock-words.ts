import type { ClockState, Sheet } from '@vtt/schema';

type Worn = NonNullable<Sheet['effects']>[number];

export const plural = (n: number, one: string, few: string, many: string): string => {
  const tens = Math.abs(n) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
};

const two = (n: number) => String(n).padStart(2, '0');

export function dayTime(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const day = Math.floor(whole / 86400) + 1;
  const rest = whole % 86400;
  const clock = `${two(Math.floor(rest / 3600))}:${two(Math.floor((rest % 3600) / 60))}`;
  return `День ${day}, ${clock}${rest % 60 ? `:${two(rest % 60)}` : ''}`;
}

export function spanWords(sec: number): string {
  const whole = Math.max(0, Math.ceil(sec));
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.ceil((whole % 3600) / 60);
  if (days) return `${days} ${plural(days, 'день', 'дня', 'дней')}${hours ? ` ${hours} ч` : ''}`;
  if (hours) return `${hours} ч${minutes ? ` ${minutes} мин` : ''}`;
  if (minutes) return `${minutes} мин`;
  return `${whole} с`;
}

export function expiryWords(entry: Worn, clock: ClockState | null | undefined): string | null {
  const parts: string[] = [];
  if (typeof entry.turnsLeft === 'number') parts.push(`ещё ${entry.turnsLeft} ${plural(entry.turnsLeft, 'ход', 'хода', 'ходов')}`);
  if (typeof entry.until === 'number') parts.push(`до раунда ${entry.until}`);
  if (typeof entry.atSec === 'number') {
    const left = entry.atSec - Number(clock?.sec ?? 0);
    parts.push(left > 0 ? `ещё ${spanWords(left)}` : 'истекает');
  }
  if (entry.combat) parts.push('до конца боя');
  if (entry.scene) parts.push('до конца сцены');
  if (typeof entry.usesLeft === 'number') parts.push(`ещё ${entry.usesLeft} ${plural(entry.usesLeft, 'применение', 'применения', 'применений')}`);
  return parts.length ? parts.join(', ') : null;
}

export const UNITS = [
  ['minutes', 'минут', 60],
  ['hours', 'часов', 3600],
  ['days', 'дней', 86400],
] as const;
