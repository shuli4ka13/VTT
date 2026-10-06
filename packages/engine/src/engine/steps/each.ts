import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'each';
const words: StepWords = STEP_WORDS.each;
export const { label, hint, slots, outputs } = words;

export const splits = true;

export const mayBreak = false;

export const icon = '⟳';

export const traceLine = (): string => 'для каждого';

export function lint(step: { of?: unknown }) {
  if (typeof step.of !== 'string' || !step.of) return 'не сказано, из какого списка брать листы';
  return null;
}

export const loopOf = (params: readonly { key: string; label?: string; item?: { key: string; label?: string } }[] | undefined, step: { of?: unknown }): { key: string; label: string } | null => {
  const list = (params ?? []).find(param => param.key === step.of);
  return list?.item ? { key: list.item.key, label: list.item.label ?? list.item.key } : null;
};

export function finish() {
  return { value: null, trace: {}, break: null };
}
