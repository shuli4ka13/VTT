import { durationOf, findEffect } from '../engine/effects.ts';
import type { Clock } from '../engine/clock.ts';
import type { Effect, Sheet, System, WornEffect } from '../model/types.ts';

export type TurnEdge = 'turn-end' | 'turn-start';


export interface Expired { sheetId: string; effectId: string }

export interface Lapse { moment: string; sheetId: string }

export const edgeOf = (effect: Effect | null | undefined): TurnEdge =>
  (effect?.duration?.ends === 'turn-start' ? 'turn-start' : 'turn-end');

export const ticksBy = (effect: Effect | null | undefined): string | null => effect?.duration?.by ?? null;

export const burnsUse = (effect: Effect | null | undefined): boolean => durationOf(effect) === 'uses';

export function spendUse(sheet: Sheet, effectId: string): Sheet {
  const effects: Sheet['effects'] = [];
  for (const entry of sheet.effects || []) {
    if (entry.effectId !== effectId) { effects.push(entry); continue; }
    const left = Number(entry.usesLeft ?? 1) - 1;
    if (left > 0) effects.push({ ...entry, usesLeft: left });
  }
  return { ...sheet, effects };
}

type Verdict = WornEffect | null | undefined;

function tickTurn(system: System, owner: string, entry: WornEffect, event: Lapse): Verdict {
  if (typeof entry.turnsLeft !== 'number') return undefined;
  const effect = findEffect(system, entry.effectId);
  if (edgeOf(effect) !== event.moment) return undefined;
  const by = ticksBy(effect);
  const counts = by ? entry.args?.[by] === event.sheetId : owner === event.sheetId;
  if (!counts) return undefined;
  const turnsLeft = entry.turnsLeft - 1;
  return turnsLeft > 0 ? { ...entry, turnsLeft } : null;
}

function verdictOf(system: System, owner: string, entry: WornEffect, event: Lapse, clock: Clock | null | undefined): Verdict {
  if ((event.moment === 'time' || event.moment === 'round-start') && owner === event.sheetId && typeof entry.atSec === 'number' && entry.atSec <= Number(clock?.sec ?? 0)) return null;
  switch (event.moment) {
    case 'turn-start':
    case 'turn-end':
      return tickTurn(system, owner, entry, event);
    case 'round-start':
      if (owner !== event.sheetId || typeof entry.until !== 'number' || !clock) return undefined;
      return entry.until > clock.round ? undefined : null;
    case 'combat-end':
    case 'combat-leave':
      if (owner !== event.sheetId) return undefined;
      return typeof entry.until === 'number' || typeof entry.turnsLeft === 'number' || entry.combat === true ? null : undefined;
    case 'scene-end':
      if (owner !== event.sheetId) return undefined;
      return entry.scene === true ? null : undefined;
    default:
      return undefined;
  }
}

export function lapse(
  event: Lapse, sheets: Sheet[], system: System, clock: Clock | null | undefined,
): { sheets: Sheet[]; expired: Expired[] } {
  const expired: Expired[] = [];
  const next = sheets.map(sheet => {
    const worn = sheet.effects ?? [];
    let changed = false;
    const left: WornEffect[] = [];
    for (const entry of worn) {
      const verdict = verdictOf(system, sheet.id, entry, event, clock);
      if (verdict === undefined) { left.push(entry); continue; }
      changed = true;
      if (verdict) left.push(verdict);
      else expired.push({ sheetId: sheet.id, effectId: entry.effectId });
    }
    return changed ? { ...sheet, effects: left } : sheet;
  });
  return { sheets: next, expired };
}
