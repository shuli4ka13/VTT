export interface RolledSummary {
  total: number;
  natural: number;
  rolled: number;
  atMax: number;
  atMin: number;
  edited: boolean;
  dice: { rolls: number[]; kept: number | null };
  parts: Record<string, number>;
}

export const SUMMARY_KEYS: readonly (keyof RolledSummary)[] = ['total', 'natural', 'rolled', 'atMax', 'atMin', 'edited', 'dice', 'parts'];

export const rolledBySender = (step: { type?: string; side?: string }): boolean =>
  step.type === 'threshold' && (step.side ?? 'sender') === 'sender';

export function rolledSummary(step: Record<string, unknown>): RolledSummary | null {
  const rolled = step.rolled as {
    total: number; rolls: number[]; kept: number | null;
    tally?: { dice: number; atMax: number; atMin: number };
    edits?: unknown[];
    parts?: Record<string, number>;
  } | undefined;
  if (!rolled) return null;

  const bonusRef = step.bonus as { const?: unknown } | undefined;
  const bonus = (typeof bonusRef?.const === 'number' ? bonusRef.const : 0)
    + (typeof step.modBonus === 'number' ? step.modBonus : 0);

  return {
    total: rolled.total + bonus,
    natural: rolled.total,
    rolled: rolled.tally?.dice ?? rolled.rolls.length,
    atMax: rolled.tally?.atMax ?? 0,
    atMin: rolled.tally?.atMin ?? 0,
    edited: (rolled.edits?.length ?? 0) > 0,
    dice: { rolls: rolled.rolls, kept: rolled.kept },
    parts: rolled.parts || {},
  };
}

export function rolledSoFar(steps: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const step of steps) {
    if (step.id == null) continue;
    const summary = rolledSummary(step);
    if (summary) out[String(step.id)] = summary;
  }
  return out;
}
