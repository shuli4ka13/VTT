import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'each';
const words: StepWords = STEP_WORDS.each;
export const { label, hint, slots, outputs } = words;

export const splits = true;

export const mayBreak = false;

export const icon = '⟳';

export const traceLine = (): string => 'для каждого';

export function lint(step: { of?: unknown; as?: unknown }) {
  if (typeof step.of !== 'string' || !step.of) return 'не сказано, из какого списка брать листы';
  if (typeof step.as !== 'string' || !step.as) return 'не сказано, как назвать каждый лист';
  return null;
}

export function finish() {
  return { value: null, trace: {}, break: null };
}
