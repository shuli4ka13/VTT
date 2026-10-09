import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import type { StepData, StepContext, StepModule } from './index.ts';

const marker = (type: 'branch' | 'orElse' | 'end', flow: 'open' | 'alt' | 'close', icon: string): StepModule => {
  const words: StepWords = STEP_WORDS[type];
  return {
    type, label: words.label, hint: words.hint, slots: words.slots, outputs: words.outputs,
    flow, icon, mayBreak: false,
    finish: () => ({ value: null, trace: {}, break: null }),
  };
};

export const branch = marker('branch', 'open', '⑂');
export const orElse = marker('orElse', 'alt', '⑂');
export const end = marker('end', 'close', '⑂');

const stopWords: StepWords = STEP_WORDS.stop;

export const stop: StepModule = {
  type: 'stop', label: stopWords.label, hint: stopWords.hint, slots: stopWords.slots, outputs: stopWords.outputs,
  icon: '■', mayBreak: true,
  reasonWord: (reason: string) => stopWords.reasons[reason] ?? null,
  finish(step: StepData, ctx: StepContext) {
    const raw = step.note ? ctx.value(step.note) : null;
    const note = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    return { value: null, trace: { stopped: true, ...(note ? { note } : {}) }, break: { reason: 'stop', ...(note ? { note } : {}) } };
  },
};
