import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import type { Param } from '../../model/types.ts';
import { tr } from '../../words/tongue.ts';

export const type = 'each';
const words: StepWords = STEP_WORDS.each;
export const { slots, outputs } = words;

type LoopStep = { of?: unknown; rows?: unknown; as?: unknown };

export const loops = true;

export const splits = (step: LoopStep): boolean => typeof step.of === 'string' && step.of !== '';

export const rows = (step: LoopStep): { table: string; as: string } | null =>
  (typeof step.rows === 'string' && step.rows ? { table: step.rows, as: typeof step.as === 'string' ? step.as : '' } : null);

export const mayBreak = false;

export const icon = '⟳';
export const stage = (): string => 'target';

export const traceLine = (t: { table?: unknown }, h?: { tableLabel?: (id: string) => string }): string =>
  (typeof t.table === 'string' ? tr`для каждой строки «${h?.tableLabel?.(t.table) ?? t.table}»` : tr`для каждого`);

export const loopOf = (params: readonly { key: string; label?: string; item?: { key: string; label?: string } }[] | undefined, step: { of?: unknown }): { key: string; label: string } | null => {
  if (typeof step.of !== 'string' || !step.of) return null;
  const list = (params ?? []).find(param => param.key === step.of);
  return list?.item ? { key: list.item.key, label: list.item.label ?? list.item.key } : null;
};

export const loopParam = (step: LoopStep): Param | null => {
  const found = rows(step);
  const said = (step as { asLabel?: unknown }).asLabel;
  return found && found.as ? { key: found.as, label: typeof said === 'string' && said ? said : found.as, kind: 'choice', from: found.table } as Param : null;
};

export function finish() {
  return { value: null, trace: {}, break: null };
}
