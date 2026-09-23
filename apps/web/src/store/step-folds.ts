import { create } from 'zustand';

const KEY = 'vtt.step-opened';

const load = (): Record<string, true> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, true>; } catch { return {}; }
};

const save = (opened: Record<string, true>): Record<string, true> => {
  try { localStorage.setItem(KEY, JSON.stringify(opened)); } catch { return opened; }
  return opened;
};

export interface StepFoldsState {
  opened: Record<string, true>;
  toggle: (key: string) => void;
  setOpen: (keys: string[], open: boolean) => void;
}

export const useStepFolds = create<StepFoldsState>()((set, get) => ({
  opened: load(),
  toggle: key => {
    const next = { ...get().opened };
    if (next[key]) delete next[key]; else next[key] = true;
    set({ opened: save(next) });
  },
  setOpen: (keys, open) => {
    const next = { ...get().opened };
    for (const key of keys) { if (open) next[key] = true; else delete next[key]; }
    set({ opened: save(next) });
  },
}));
