import { findEffect } from '../engine/effects.ts';
import type { System, Sheet, WornEffect } from '../model/types.ts';

export interface BondBreak { sheetId: string; effectId: string; by: string; from: string }

export const holdsBond = (effect: { bond?: { effect: string; by: string } } | null | undefined): boolean => Boolean(effect?.bond);

export function releaseHolder(
  system: System, sheets: Sheet[], casterId: string, holder: string,
): { sheets: Sheet[]; broken: BondBreak[] } {
  const caster = sheets.find(s => s.id === casterId);
  if (!caster || !(caster.effects ?? []).some(entry => entry.effectId === holder)) return { sheets, broken: [] };
  const freed = sheets.map(sheet => (sheet.id === casterId
    ? { ...sheet, effects: (sheet.effects ?? []).filter(entry => entry.effectId !== holder) }
    : sheet));
  return sweepBonds(system, freed);
}

const held = (entry: WornEffect): { from: string; by: string } | null =>
  (entry.bond ? { from: entry.bond.sheet, by: entry.bond.by } : null);

export function sweepBonds(system: System, sheets: Sheet[]): { sheets: Sheet[]; broken: BondBreak[] } {
  const wearing = new Map<string, Set<string>>();
  for (const sheet of sheets) {
    wearing.set(sheet.id, new Set((sheet.effects ?? []).map(entry => entry.effectId)));
  }

  const broken: BondBreak[] = [];
  const next = sheets.map(sheet => {
    const worn = sheet.effects ?? [];
    const left = worn.filter(entry => {
      const bond = held(entry);
      if (!bond) return true;
      if (!findEffect(system, bond.by)) return true;
      const alive = wearing.get(bond.from)?.has(bond.by) ?? false;
      if (!alive) broken.push({ sheetId: sheet.id, effectId: entry.effectId, ...bond });
      return alive;
    });
    return left.length === worn.length ? sheet : { ...sheet, effects: left };
  });

  return { sheets: next, broken };
}
