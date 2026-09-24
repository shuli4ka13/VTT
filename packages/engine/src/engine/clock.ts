import { durationOf, findEffect } from './effects.ts';
import { newPass } from './calc.ts';
import { resolveRoll } from './modifiers.ts';
import { dieConstant, rollLead, unfoldDice } from './lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from './refs.ts';
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
  const fighters = sheets.filter(sheet => !isDesk(sheet));
  if (!spec) return { order: fighters.map(s => s.id), rolls: [] };

  const rolls = fighters.map((sheet): InitiativeRoll => {
    const pass = newPass(system, sheet, { compendium });
    const ctx = { pass, owner: 'инициатива' };
    const mods = resolveRoll(system, sheet, spec.tags ?? [], pass);
    const def = unfoldDice(dieConstant(system, spec.die.constant), (ref, what) => resolveNumber(packRef(ref, ctx), ctx, what));
    const rolled = rollLead(def, die, mods.edits);
    const bonus = spec.bonus ? (resolveOptionalNumber(packRef(spec.bonus, ctx), ctx, 'бонус инициативы') ?? 0) : 0;
    return { sheetId: sheet.id, rolls: rolled.rolls, total: rolled.total + bonus + mods.bonus, edits: rolled.edits };
  });

  const order = [...rolls].sort((a, b) => b.total - a.total).map(r => r.sheetId);
  return { order, rolls };
}

export function effectLabel(system: System, id: string): string {
  return findEffect(system, id)?.label ?? id;
}
