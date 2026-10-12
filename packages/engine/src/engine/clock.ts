import { durationOf, findEffect } from './effects.ts';
import { EngineError } from './errors.ts';
import type { System, Effect, WornEffect } from '../model/types.ts';

export interface Clock {
  round: number;
  order: string[];
  active: string | null;
}

export const idleClock = (): Clock => ({ round: 0, order: [], active: null });

export const inCombat = (clock: Clock | null | undefined): clock is Clock =>
  Boolean(clock && clock.round > 0 && clock.active !== null && clock.order.length > 0);

export function expiryOf(effect: Effect, clock: Clock | null | undefined, counted?: number): Partial<WornEffect> {
  const kind = durationOf(effect);
  if (kind === 'scene') return { scene: true };
  if (!inCombat(clock)) return {};
  const max = Math.max(1, Math.floor(Number(counted ?? effect.duration?.max ?? 1)) || 1);
  if (kind === 'rounds') return { until: clock.round + max };
  if (kind === 'turns') return { turnsLeft: max };
  if (kind === 'combat') return { combat: true };
  return {};
}

export function startCombat(_clock: Clock, order: string[]): Clock {
  if (!order.length) throw new EngineError('бой не начать: порядок ходов пуст');
  return { round: 1, order: [...order], active: order[0]! };
}

export const stopCombat = (): Clock => idleClock();

export function nextTurn(clock: Clock): Clock {
  if (!inCombat(clock)) throw new EngineError('бой не идёт — сначала порядок ходов');
  const at = clock.order.indexOf(String(clock.active));
  const nextAt = (at + 1) % clock.order.length;
  return { ...clock, round: clock.round + (nextAt === 0 ? 1 : 0), active: clock.order[nextAt]! };
}

export function effectLabel(system: System, id: string): string {
  return findEffect(system, id)?.label ?? id;
}
