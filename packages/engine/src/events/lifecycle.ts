import { wornEffects } from '../engine/effects.ts';
import type { WornEntry } from '../engine/effects.ts';
import type { Compendium, System } from '../model/types.ts';
import type { Sheet, WornEffect } from '../model/types.ts';
import { live } from '../words/tongue.ts';

export type Turn = 'attach' | 'detach';

export interface Change { sheetId: string; entry: WornEffect; turn: Turn; worn?: WornEntry }

export const HOOK_WORDS: Record<Turn, string> = live({ attach: 'при наложении', detach: 'при спадании' });

export const HEARD_WORDS: Record<Turn, string> = live({ attach: 'появилось', detach: 'ушло' });

const actingOn = (sheet: Sheet, world: { system: System; compendium?: Compendium | null }): WornEntry[] =>
  wornEffects(world.system, sheet, { strict: false, compendium: world.compendium });

export function lifecycleChanges(before: Sheet[], after: Sheet[], world: { system: System; compendium?: Compendium | null }): Change[] {
  const out: Change[] = [];
  for (const sheet of after) {
    const was = before.find(s => s.id === sheet.id);
    if (!was || was === sheet) continue;
    const old = actingOn(was, world);
    for (const worn of actingOn(sheet, world)) {
      const entry = worn.entry;
      const mine = (o: WornEntry): boolean => o.entry.effectId === entry.effectId && (Boolean(o.item) || Boolean(worn.item)
        ? o.entry.inst === entry.inst
        : o.entry.inst === undefined || entry.inst === undefined || o.entry.inst === entry.inst);
      const same = old.findIndex(o => mine(o) && JSON.stringify(o.entry.args ?? {}) === JSON.stringify(entry.args ?? {}));
      const at = same >= 0 ? same : old.findIndex(mine);
      if (at >= 0) old.splice(at, 1);
      else out.push({ sheetId: sheet.id, entry, turn: 'attach', ...(worn.item ? { worn } : {}) });
    }
    for (const worn of old) out.push({ sheetId: sheet.id, entry: worn.entry, turn: 'detach', ...(worn.item ? { worn } : {}) });
  }
  return out;
}

