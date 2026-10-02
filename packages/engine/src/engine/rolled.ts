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
  (step.type === 'threshold' && (step.side ?? 'sender') === 'sender') || step.type === 'amount';
