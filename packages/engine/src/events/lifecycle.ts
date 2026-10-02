import { wornEffects } from '../engine/effects.ts';
import type { Compendium, System } from '../model/types.ts';
import type { Sheet, WornEffect } from '../model/types.ts';

export type Turn = 'attach' | 'detach';

export interface Change { sheetId: string; entry: WornEffect; turn: Turn }

export const HOOK_WORDS: Record<Turn, string> = { attach: 'при наложении', detach: 'при спадании' };

export const HEARD_WORDS: Record<Turn, string> = { attach: 'появилось', detach: 'ушло' };

const actingOn = (sheet: Sheet, world: { system: System; compendium?: Compendium | null }): WornEffect[] =>
  wornEffects(world.system, sheet, { strict: false, compendium: world.compendium }).map(worn => worn.entry);

export function lifecycleChanges(before: Sheet[], after: Sheet[], world: { system: System; compendium?: Compendium | null }): Change[] {
  const out: Change[] = [];
  for (const sheet of after) {
    const was = before.find(s => s.id === sheet.id);
    if (!was || was === sheet) continue;
    const old = actingOn(was, world);
    for (const entry of actingOn(sheet, world)) {
      const at = old.findIndex(o => o.effectId === entry.effectId);
      if (at >= 0) old.splice(at, 1);
      else out.push({ sheetId: sheet.id, entry, turn: 'attach' });
    }
    for (const entry of old) out.push({ sheetId: sheet.id, entry, turn: 'detach' });
  }
  return out;
}

