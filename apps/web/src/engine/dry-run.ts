import { useMemo } from 'react';
import { trial, mannequin, DICE_MODES } from '@vtt/engine/events/trial';
import type { DiceMode } from '@vtt/engine/events/trial';
import type { System, Compendium, Sheet } from '@vtt/schema';

export type { DiceMode };
export { DICE_MODES };

export const MANNEQUINS: { id: string; name: string }[] = [
  { id: 'манекен_а', name: 'А' },
  { id: 'манекен_б', name: 'Б' },
];

export const mannequinsOf = (system: System): Sheet[] => {
  const kept = system.mannequins ?? [];
  return MANNEQUINS.map(({ id, name }) =>
    kept.find(sheet => sheet.id === id) ?? (mannequin(system as never, id, name) as Sheet));
};

export interface DryRun {
  lines: string[];
  changes: { sheet: string; tag: string; from: unknown; to: unknown }[];
  sheets: Sheet[];
  trouble: string | null;
}

export function dryRun(
  system: System, compendium: Compendium | undefined, effectId: string, dice: DiceMode,
): DryRun {
  const [from, to] = mannequinsOf(system);
  try {
    const out = trial({ system: system as never, compendium: compendium as never, effectId, from: from as never, to: to as never, dice });
    const changes = out.reports.flatMap(entry =>
      ((entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[]).map(change => ({
        sheet: out.sheets.find(s => s.id === entry.toId)?.name ?? entry.toId,
        ...change,
      })));
    return { lines: out.lines, changes, sheets: out.sheets as Sheet[], trouble: null };
  } catch (err) {
    return { lines: [], changes: [], sheets: [from!, to!], trouble: (err as Error).message };
  }
}

export function useDryRun(
  system: System, compendium: Compendium | undefined, effectId: string | null, dice: DiceMode,
): DryRun | null {
  return useMemo(
    () => (effectId ? dryRun(system, compendium, effectId, dice) : null),
    [system, compendium, effectId, dice],
  );
}
