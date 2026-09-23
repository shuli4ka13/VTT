import { durationOf, findEffect } from './effects.ts';
import { newPass } from './calc.ts';
import { resolveRoll } from './modifiers.ts';
import { dieConstant, rollLead, unfoldDice } from './lead-die.ts';
import { packRef, resolveNumber, resolveOptionalNumber } from './refs.ts';
import { EngineError } from './errors.ts';
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
  return {};
}

export interface Expired { sheetId: string; effectId: string }

export interface Tick {
  clock: Clock;
  sheets: Sheet[];
  expired: Expired[];
}

const shed = (
  sheet: Sheet, keep: (entry: WornEffect) => boolean, expired: Expired[],
): Sheet => {
  const worn = sheet.effects ?? [];
  const left = worn.filter(entry => {
    const stays = keep(entry);
    if (!stays) expired.push({ sheetId: sheet.id, effectId: entry.effectId });
    return stays;
  });
  return left.length === worn.length ? sheet : { ...sheet, effects: left };
};

export function startCombat(_clock: Clock, order: string[]): Clock {
  if (!order.length) throw new EngineError('бой не начать: порядок ходов пуст');
  return { round: 1, order: [...order], active: order[0]! };
}

export const stopCombat = (): Clock => idleClock();

export type TurnEdge = 'turn-end' | 'turn-start';

export const endsAtOf = (effect: Effect | null | undefined): TurnEdge =>
  (effect?.duration?.ends === 'turn-start' ? 'turn-start' : 'turn-end');

export function nextTurn(clock: Clock, sheets: Sheet[], endsAt: (effectId: string) => TurnEdge = () => 'turn-end'): Tick {
  if (!inCombat(clock)) throw new EngineError('бой не идёт — сначала порядок ходов');
  const expired: Expired[] = [];
  const ended = clock.active;

  let next = sheets.map(sheet => (sheet.id !== ended ? sheet : countOwnTurn(sheet, 'turn-end', endsAt, expired)));

  const at = clock.order.indexOf(String(ended));
  const nextAt = (at + 1) % clock.order.length;
  const roundStarted = nextAt === 0;
  const round = clock.round + (roundStarted ? 1 : 0);
  const active = clock.order[nextAt]!;

  if (roundStarted) {
    next = next.map(sheet => shed(sheet, entry => typeof entry.until !== 'number' || entry.until > round, expired));
  }
  next = next.map(sheet => (sheet.id !== active ? sheet : countOwnTurn(sheet, 'turn-start', endsAt, expired)));

  return { clock: { ...clock, round, active }, sheets: next, expired };
}

function countOwnTurn(
  sheet: Sheet, edge: TurnEdge, endsAt: (effectId: string) => TurnEdge, expired: Expired[],
): Sheet {
  const worn = sheet.effects ?? [];
  let changed = false;
  const left: WornEffect[] = [];
  for (const entry of worn) {
    if (typeof entry.turnsLeft !== 'number' || endsAt(entry.effectId) !== edge) { left.push(entry); continue; }
    changed = true;
    const turnsLeft = entry.turnsLeft - 1;
    if (turnsLeft > 0) left.push({ ...entry, turnsLeft });
    else expired.push({ sheetId: sheet.id, effectId: entry.effectId });
  }
  return changed ? { ...sheet, effects: left } : sheet;
}

export function endScene(sheets: Sheet[]): { sheets: Sheet[]; expired: Expired[] } {
  const expired: Expired[] = [];
  return { sheets: sheets.map(sheet => shed(sheet, entry => entry.scene !== true, expired)), expired };
}

export interface InitiativeRoll { sheetId: string; rolls: number[]; total: number; edits: string[] }

export function rollInitiative(
  system: System, sheets: Sheet[], compendium: Compendium, die: Die,
): { order: string[]; rolls: InitiativeRoll[] } {
  const spec = system.initiative;
  const fighters = sheets.filter(sheet => sheet.kind !== 'desk');
  if (!spec) return { order: fighters.map(s => s.id), rolls: [] };

  const rolls = fighters.map((sheet): InitiativeRoll => {
    const pass = newPass(system, sheet, { compendium });
    const ctx = { pass, owner: 'инициатива' };
    const mods = resolveRoll(system, sheet, spec.check ?? null, pass);
    const def = unfoldDice(dieConstant(system, spec.die.constant), (ref, what) => resolveNumber(ref, ctx, what));
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
