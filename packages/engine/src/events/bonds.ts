import { findEffect } from '../engine/effects.ts';
import type { System, Sheet, WornEffect } from '../model/types.ts';

export interface BondBreak { sheetId: string; effectId: string; holder: string; from: string }

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

const held = (entry: WornEffect): { from: string; holder: string; inst?: string } | null =>
  (entry.bond ? { from: entry.bond.sheet, holder: entry.bond.effect, ...(entry.bond.inst ? { inst: entry.bond.inst } : {}) } : null);

const slot = (sheet: string, effect: string, inst?: string): string => `${sheet}\u0000${effect}\u0000${inst ?? ''}`;

export function sweepBonds(system: System, sheets: Sheet[]): { sheets: Sheet[]; broken: BondBreak[] } {
  const wearing = new Set<string>();
  for (const sheet of sheets) {
    for (const entry of sheet.effects ?? []) {
      wearing.add(slot(sheet.id, entry.effectId));
      if (entry.inst) wearing.add(slot(sheet.id, entry.effectId, entry.inst));
    }
  }

  const broken: BondBreak[] = [];
  const next = sheets.map(sheet => {
    const worn = sheet.effects ?? [];
    const left = worn.filter(entry => {
      const bond = held(entry);
      if (!bond) return true;
      if (!findEffect(system, bond.holder)) return true;
      const alive = wearing.has(slot(bond.from, bond.holder, bond.inst));
      if (!alive) broken.push({ sheetId: sheet.id, effectId: entry.effectId, from: bond.from, holder: bond.holder });
      return alive;
    });
    return left.length === worn.length ? sheet : { ...sheet, effects: left };
  });

  return { sheets: next, broken };
}

const heldSlots = (sheets: readonly Sheet[]): Set<string> => {
  const out = new Set<string>();
  for (const sheet of sheets) {
    for (const entry of sheet.effects ?? []) {
      if (entry.bond?.inst) out.add(slot(entry.bond.sheet, entry.bond.effect, entry.bond.inst));
    }
  }
  return out;
};

export function freeHolders(before: readonly Sheet[], sheets: Sheet[]): { sheets: Sheet[]; freed: { sheetId: string; effectId: string }[] } {
  const was = heldSlots(before);
  const now = heldSlots(sheets);
  const freed: { sheetId: string; effectId: string }[] = [];
  const next = sheets.map(sheet => {
    const worn = sheet.effects ?? [];
    const left = worn.filter(entry => {
      if (!entry.inst) return true;
      const key = slot(sheet.id, entry.effectId, entry.inst);
      if (!was.has(key) || now.has(key)) return true;
      freed.push({ sheetId: sheet.id, effectId: entry.effectId });
      return false;
    });
    return left.length === worn.length ? sheet : { ...sheet, effects: left };
  });
  return { sheets: next, freed };
}
