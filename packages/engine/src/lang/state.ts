import { newPass } from '../engine/calc.ts';
import { sharedOf, deskFor } from '../events/desk.ts';
import type { Pass } from '../engine/calc.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet, Compendium } from '../model/types.ts';

export class State {
  constructor(
    public sheets: Sheet[],
    readonly system: System,
    readonly compendium: Compendium,
    readonly clock: Clock | null,
  ) {}

  shared(): Sheet[] {
    return sharedOf(this.system, this.sheets);
  }

  find(id: string): Sheet | null {
    return this.sheets.find(sheet => sheet.id === id) ?? this.shared().find(sheet => sheet.id === id) ?? null;
  }

  get(id: string): Sheet {
    const sheet = this.find(id);
    if (!sheet) throw new Error(`не найден лист «${id}»`);
    return sheet;
  }

  put(sheet: Sheet): void {
    const at = this.sheets.findIndex(s => s.id === sheet.id);
    if (at < 0) this.sheets = [...this.sheets, sheet];
    else this.sheets = this.sheets.map((s, i) => (i === at ? sheet : s));
  }

  pass(id: string): Pass {
    return newPass(this.system, this.get(id), { compendium: this.compendium, shared: this.shared() });
  }

  desk(): Sheet | null {
    return deskFor(this.system, this.sheets);
  }

  save(): Sheet[] {
    return this.sheets;
  }

  restore(saved: Sheet[]): void {
    this.sheets = saved;
  }
}
