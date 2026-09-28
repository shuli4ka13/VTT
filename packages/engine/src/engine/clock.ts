import { durationOf, findEffect } from './effects.ts';
import { rollCheck } from './check.ts';
import { EngineError } from './errors.ts';
import { isDesk } from './owners.ts';
import type { System, Sheet, Effect, WornEffect, Compendium, Die } from '../model/types.ts';

export interface Clock {
  round: number;
  order: string[];
  active: string | null;
}

export const idleClock = (): Clock => ({ round: 0, order: [], active: null });

export const inCombat = (clock: Clock | null | undefined): clock is Clock =>
  Boolean(clock && clock.round > 0 && clock.active !== null && clock.order.length > 0);

export function expiryOf(effect: Effect, clock: Clock | null | undefined): Partial<WornEffect> {
  const kind = durationOf(effect);
  if (kind === 'scene') return { scene: true };
  if (!inCombat(clock)) return {};
  const max = Math.max(1, Math.floor(Number(effect.duration?.max ?? 1)) || 1);
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

export interface InitiativeRoll { sheetId: string; rolls: number[]; total: number; edits: string[] }

export function rollInitiative(
  system: System, sheets: Sheet[], compendium: Compendium, die: Die,
): { order: string[]; rolls: InitiativeRoll[] } {
  const spec = system.initiative;
  const fighters = sheets.filter(sheet => !isDesk(sheet) && !sheets.some(other => other.group === sheet.id));
  if (!spec) return { order: fighters.map(s => s.id), rolls: [] };

  const rolls = fighters.map((sheet): InitiativeRoll => {
    const checked = rollCheck(system, sheet, spec, { compendium, die, owner: 'инициатива' });
    return { sheetId: sheet.id, rolls: checked.rolled.rolls, total: checked.total, edits: checked.rolled.edits };
  });

  const order = [...rolls].sort((a, b) => b.total - a.total).map(r => r.sheetId);
  return { order, rolls };
}

export function effectLabel(system: System, id: string): string {
  return findEffect(system, id)?.label ?? id;
}
