import { durationOf, findEffect } from './effects.ts';
import { EngineError } from './errors.ts';
import type { System, Effect, WornEffect } from '../model/types.ts';

export interface Clock {
  round: number;
  order: string[];
  active: string | null;
  sec?: number;
  scores?: Record<string, number>;
}

export const idleClock = (sec = 0): Clock => ({ round: 0, order: [], active: null, ...(sec ? { sec } : {}) });

export const ROUND_SECONDS = 3;
const UNIT = { minutes: 60, hours: 3600, days: 86400 } as const;

export const secOf = (clock: Clock | null | undefined): number => Number(clock?.sec ?? 0);

export const inCombat = (clock: Clock | null | undefined): clock is Clock =>
  Boolean(clock && clock.round > 0 && clock.active !== null && clock.order.length > 0);

export function expiryOf(effect: Effect, clock: Clock | null | undefined, counted?: number): Partial<WornEffect> {
  const kind = durationOf(effect);
  if (kind === 'scene') return { scene: true };
  if (kind === 'minutes' || kind === 'hours' || kind === 'days') {
    const span = Math.max(0, Number(counted ?? effect.duration?.max ?? 1)) || 1;
    return { atSec: secOf(clock) + span * UNIT[kind] };
  }
  if (!inCombat(clock)) return {};
  const max = Math.max(1, Math.floor(Number(counted ?? effect.duration?.max ?? 1)) || 1);
  if (kind === 'rounds') return { until: clock.round + max };
  if (kind === 'turns') return { turnsLeft: max };
  if (kind === 'combat') return { combat: true };
  return {};
}

export function startCombat(clock: Clock, order: string[], scores: Record<string, number> = {}): Clock {
  if (!order.length) throw new EngineError('бой не начать: порядок ходов пуст');
  return {
    round: 1, order: [...order], active: order[0]!,
    ...(secOf(clock) ? { sec: secOf(clock) } : {}),
    ...(Object.keys(scores).length ? { scores: { ...scores } } : {}),
  };
}

export function joinCombat(clock: Clock, who: string[], scores: Record<string, number> = {}): Clock {
  if (!inCombat(clock)) throw new EngineError('бой не идёт — вступать некуда');
  const order = [...clock.order];
  const known = { ...(clock.scores ?? {}), ...scores };
  const ranked = Boolean(clock.scores) && who.every(id => id in scores);
  for (const id of who) {
    if (!ranked) { order.push(id); continue; }
    const at = order.findIndex(other => (known[other] ?? Number.NEGATIVE_INFINITY) < known[id]!);
    order.splice(at < 0 ? order.length : at, 0, id);
  }
  return { ...clock, order, ...(ranked ? { scores: known } : {}) };
}

export function leaveCombat(clock: Clock, who: string[]): Clock {
  if (!inCombat(clock)) throw new EngineError('бой не идёт — выходить не из чего');
  const order = clock.order.filter(id => !who.includes(id));
  if (!order.length) return stopCombat(clock);
  const scores = clock.scores ? Object.fromEntries(Object.entries(clock.scores).filter(([id]) => !who.includes(id))) : undefined;
  return { ...clock, order, ...(scores ? { scores } : {}) };
}

export const stopCombat = (clock?: Clock | null): Clock => idleClock(secOf(clock));

export function spanText(seconds: number): string {
  const parts: string[] = [];
  let rest = Math.round(seconds);
  for (const [size, word] of [[86400, 'дн.'], [3600, 'ч'], [60, 'мин'], [1, 'с']] as const) {
    if (rest >= size) { parts.push(`${Math.floor(rest / size)} ${word}`); rest %= size; }
  }
  return parts.join(' ') || '0 с';
}

export const passTime = (clock: Clock | null | undefined, seconds: number): Clock =>
  ({ ...(clock ?? idleClock()), sec: secOf(clock) + seconds });

export function nextTurn(clock: Clock): Clock {
  if (!inCombat(clock)) throw new EngineError('бой не идёт — сначала порядок ходов');
  const at = clock.order.indexOf(String(clock.active));
  const nextAt = (at + 1) % clock.order.length;
  const newRound = nextAt === 0;
  return { ...clock, round: clock.round + (newRound ? 1 : 0), active: clock.order[nextAt]!, ...(newRound ? { sec: secOf(clock) + ROUND_SECONDS } : {}) };
}

export function effectLabel(system: System, id: string): string {
  return findEffect(system, id)?.label ?? id;
}
