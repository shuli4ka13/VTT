import { create } from 'zustand';

export interface FormulaTarget {
  id: string;
  where: string;
  value: string;
  onChange: (value: string) => void;
}

export interface FormulaBarState {
  target: FormulaTarget | null;
  open: (target: FormulaTarget) => void;
  write: (value: string) => void;
  close: () => void;
}

export const useFormulaBar = create<FormulaBarState>()((set, get) => ({
  target: null,
  open: target => set({ target }),
  write: value => {
    const target = get().target;
    if (!target) return;
    target.onChange(value);
    set({ target: { ...target, value } });
  },
  close: () => set({ target: null }),
}));
