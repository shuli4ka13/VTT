import { create } from 'zustand';

const KEY = 'vtt.step-folds';

const load = (): Record<string, true> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, true>; } catch { return {}; }
};

const save = (folded: Record<string, true>): Record<string, true> => {
  try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch { return folded; }
  return folded;
};

export interface StepFoldsState {
  folded: Record<string, true>;
  toggle: (key: string) => void;
  setMany: (keys: string[], on: boolean) => void;
}

export const useStepFolds = create<StepFoldsState>()((set, get) => ({
  folded: load(),
  toggle: key => {
    const next = { ...get().folded };
    if (next[key]) delete next[key]; else next[key] = true;
    set({ folded: save(next) });
  },
  setMany: (keys, on) => {
    const next = { ...get().folded };
    for (const key of keys) { if (on) next[key] = true; else delete next[key]; }
    set({ folded: save(next) });
  },
}));
