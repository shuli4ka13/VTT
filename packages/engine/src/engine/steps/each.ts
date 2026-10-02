import { STEP_WORDS, type StepWords } from '../../words/steps.ts';

export const type = 'each';
const words: StepWords = STEP_WORDS.each;
export const { label, hint, slots, outputs } = words;

export const splits = true;

export const mayBreak = false;

export const icon = '⟳';

export const traceLine = (): string => 'для каждой цели';

export function finish() {
  return { value: null, trace: {}, break: null };
}
