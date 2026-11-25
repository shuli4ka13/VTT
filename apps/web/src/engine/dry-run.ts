import { useMemo } from 'react';
import { trial, mannequin, DICE_MODES } from '@vtt/engine';
import type { DiceMode } from '@vtt/engine';
import type { System, Compendium, Sheet } from '@vtt/schema';
import { t } from '../i18n/index.ts';

export type { DiceMode };
export { DICE_MODES };

export const MANNEQUINS: { id: string; name: string }[] = [
  { id: 'proba_a', get name() { return t('app:mannequin.a'); } },
  { id: 'proba_b', get name() { return t('app:mannequin.b'); } },
];

export const mannequinsOf = (system: System): Sheet[] =>
  MANNEQUINS.map(({ id, name }) => mannequin(system as never, id, name) as Sheet);

export interface DryRun {
  lines: string[];
  changes: { sheet: string; tag: string; from: unknown; to: unknown }[];
  sheets: Sheet[];
  trouble: string | null;
  reports: { fromId: string; toId: string; report: unknown }[];
}

export interface Staged { handler: number; heard?: Record<string, unknown> }

export function dryRun(
  system: System, compendium: Compendium | undefined, effectId: string, dice: DiceMode, pair: Sheet[] = mannequinsOf(system), staged?: Staged,
): DryRun {
  const [from, to] = pair;
  try {
    const out = trial({ system: system as never, compendium: compendium as never, effectId, from: from as never, to: to as never, dice, random: Math.random, ...(staged ? { handler: staged.handler, ...(staged.heard ? { heard: staged.heard } : {}) } : {}) });
    const changes = out.reports.flatMap(entry =>
      ((entry.report.changes ?? []) as { tag: string; from: unknown; to: unknown }[]).map(change => ({
        sheet: out.sheets.find(s => s.id === entry.toId)?.name ?? entry.toId,
        ...change,
      })));
    return { lines: out.lines, changes, sheets: out.sheets as Sheet[], trouble: null, reports: out.reports as DryRun['reports'] };
  } catch (err) {
    return { lines: [], changes: [], sheets: [from!, to!], trouble: (err as Error).message, reports: [] };
  }
}

export function useDryRun(
  system: System, compendium: Compendium | undefined, effectId: string | null, dice: DiceMode, pair?: Sheet[], staged?: Staged,
): DryRun | null {
  return useMemo(
    () => (effectId ? dryRun(system, compendium, effectId, dice, pair, staged) : null),
    [system, compendium, effectId, dice, pair, staged],
  );
}
