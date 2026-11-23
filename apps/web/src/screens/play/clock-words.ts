import type { ClockState, Sheet } from '@vtt/schema';
import { t } from '../../i18n/play.ts';

type Worn = NonNullable<Sheet['effects']>[number];

const two = (n: number) => String(n).padStart(2, '0');

export function dayTime(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const day = Math.floor(whole / 86400) + 1;
  const rest = whole % 86400;
  const clock = `${two(Math.floor(rest / 3600))}:${two(Math.floor((rest % 3600) / 60))}`;
  return t('play:clock.day', { day, time: `${clock}${rest % 60 ? `:${two(rest % 60)}` : ''}` });
}

export function spanWords(sec: number): string {
  const whole = Math.max(0, Math.ceil(sec));
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.ceil((whole % 3600) / 60);
  if (days) return hours ? t('play:clock.span.daysHours', { count: days, hours }) : t('play:clock.span.days', { count: days });
  if (hours) return minutes ? t('play:clock.span.hoursMinutes', { hours, minutes }) : t('play:clock.span.hours', { hours });
  if (minutes) return t('play:clock.span.minutes', { minutes });
  return t('play:clock.span.seconds', { seconds: whole });
}

export function expiryWords(entry: Worn, clock: ClockState | null | undefined): string | null {
  const parts: string[] = [];
  if (typeof entry.turnsLeft === 'number') parts.push(t('play:clock.left.turns', { count: entry.turnsLeft }));
  if (typeof entry.until === 'number') parts.push(t('play:clock.left.until', { round: entry.until }));
  if (typeof entry.atSec === 'number') {
    const left = entry.atSec - Number(clock?.sec ?? 0);
    parts.push(left > 0 ? t('play:clock.left.span', { span: spanWords(left) }) : t('play:clock.left.expires'));
  }
  if (entry.combat) parts.push(t('play:clock.left.combat'));
  if (entry.scene) parts.push(t('play:clock.left.scene'));
  if (typeof entry.usesLeft === 'number') parts.push(t('play:clock.left.uses', { count: entry.usesLeft }));
  return parts.length ? parts.join(', ') : null;
}

const unit = <K extends string>(key: K, word: () => string, seconds: number): readonly [K, string, number] => {
  const row: [K, string, number] = [key, '', seconds];
  Object.defineProperty(row, 1, { get: word, enumerable: true });
  return row;
};

export const UNITS = [
  unit('minutes', () => t('play:clock.unit.minutes'), 60),
  unit('hours', () => t('play:clock.unit.hours'), 3600),
  unit('days', () => t('play:clock.unit.days'), 86400),
] as const;
