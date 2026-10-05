import { create } from 'zustand';

export interface Looked {
  name: string;
  label: string;
  where: string;
  table?: string;
}

export interface LookupState {
  at: Looked | null;
  show: (at: Looked) => void;
  close: () => void;
}

export const useLookup = create<LookupState>(set => ({
  at: null,
  show: at => set({ at }),
  close: () => set({ at: null }),
}));
