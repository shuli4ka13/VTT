import { STEP_WORDS, type StepWords } from '../../words/steps.ts';
import type { StepData, StepContext, StepModule } from './index.ts';

const marker = (type: 'branch' | 'orElse' | 'end', flow: 'open' | 'alt' | 'close', icon: string): StepModule => {
  const words: StepWords = STEP_WORDS[type];
  return {
    type, slots: words.slots, outputs: words.outputs,
    flow, icon, mayBreak: false,
    stage: () => 'check',
    finish: () => ({ value: null, trace: {}, break: null }),
  };
};

export const branch = marker('branch', 'open', '⑂');
export const orElse = marker('orElse', 'alt', '⑂');
export const end = marker('end', 'close', '⑂');

const stopWords: StepWords = STEP_WORDS.stop;

export const stop: StepModule = {
  type: 'stop', slots: stopWords.slots, outputs: stopWords.outputs,
  icon: '■', mayBreak: true,
  halts: (step: StepData, inCost: boolean) => ({ kind: step.refusal === 'soft' || (step.refusal !== 'hard' && inCost) ? 'ask' : 'stop', note: step.note }),
  reasonWord: (reason: string) => stopWords.reasons[reason] ?? null,
  finish(step: StepData, ctx: StepContext) {
    const raw = step.note ? ctx.value(step.note) : null;
    const note = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    const kind = String(step.refusal ?? '');
    const soft = kind === 'soft' || (kind !== 'hard' && ctx.inCost === true);
    return { value: null, trace: { stopped: true, ...(note ? { note } : {}) }, break: { reason: 'stop', ...(note ? { note } : {}), ...(soft ? { soft: true } : {}) } };
  },
};
