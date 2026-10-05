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

export const mannequinsOf = (system: System): Sheet[] =>
  MANNEQUINS.map(({ id, name }) => mannequin(system as never, id, name) as Sheet);

export interface DryRun {
  lines: string[];
  changes: { sheet: string; tag: string; from: unknown; to: unknown }[];
  sheets: Sheet[];
  trouble: string | null;
}

export function dryRun(
  system: System, compendium: Compendium | undefined, effectId: string, dice: DiceMode, pair: Sheet[] = mannequinsOf(system),
): DryRun {
  const [from, to] = pair;
  try {
    const out = trial({ system: system as never, compendium: compendium as never, effectId, from: from as never, to: to as never, dice, random: Math.random });
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
  system: System, compendium: Compendium | undefined, effectId: string | null, dice: DiceMode, pair?: Sheet[],
): DryRun | null {
  return useMemo(
    () => (effectId ? dryRun(system, compendium, effectId, dice, pair) : null),
    [system, compendium, effectId, dice, pair],
  );
}
