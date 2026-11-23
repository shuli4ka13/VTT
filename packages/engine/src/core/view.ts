import { newPass, findField, holderIdOf, baseOf } from '../engine/calc.ts';
import { sharedOf } from '../events/desk.ts';
import type { Pass } from '../engine/calc.ts';
import type { System, Sheet, Compendium } from '../model/types.ts';
import { tr } from '../words/tongue.ts';

export class Views {
  private sharedFor: { sheets: readonly Sheet[]; shared: Sheet[] } | null = null;
  private readonly cache = new WeakMap<Sheet, { shared: Sheet[]; pass: Pass }>();

  constructor(readonly system: System, readonly compendium: Compendium, private readonly combat?: () => boolean, private readonly round?: () => number | null) {}

  shared(sheets: readonly Sheet[]): Sheet[] {
    if (this.sharedFor?.sheets !== sheets) this.sharedFor = { sheets, shared: sharedOf(this.system, sheets) };
    return this.sharedFor.shared;
  }

  sheet(sheets: readonly Sheet[], id: string): Sheet | null {
    return sheets.find(s => s.id === id) ?? this.shared(sheets).find(s => s.id === id) ?? null;
  }

  of(sheets: readonly Sheet[], id: string): Pass {
    const sheet = this.sheet(sheets, id);
    if (!sheet) throw new Error(tr`взгляд на лист «${id}»: такого листа нет`);
    const shared = this.shared(sheets);
    const known = this.cache.get(sheet);
    if (known && known.shared === shared) return known.pass;
    const pass = newPass(this.system, sheet, { compendium: this.compendium, shared, peer: other => (this.sheet(sheets, other) ? this.of(sheets, other) : null), ...(this.combat ? { combat: this.combat } : {}), ...(this.round ? { round: this.round } : {}) });
    this.cache.set(sheet, { shared, pass });
    return pass;
  }

  holderOf(sheets: readonly Sheet[], sheetId: string, tag: string): string {
    return holderOf(this.system, sheets, sheetId, tag);
  }
}

export const viewOf = (system: System, compendium: Compendium, sheets: readonly Sheet[], id: string): Pass =>
  new Views(system, compendium).of(sheets, id);

export function baseValue(system: System, compendium: Compendium, sheets: readonly Sheet[], sheetId: string, tag: string): unknown {
  const field = findField(system, tag);
  const views = new Views(system, compendium);
  const holder = views.sheet(sheets, holderOf(system, sheets, sheetId, tag)) ?? views.sheet(sheets, sheetId);
  if (!field || !holder) return undefined;
  return baseOf(views.of(sheets, holder.id), field);
}

export function holderOf(system: System, sheets: readonly Sheet[], sheetId: string, tag: string): string {
  const sheet = sheets.find(s => s.id === sheetId);
  return (sheet && holderIdOf(findField(system, tag), sheet)) || sheetId;
}
