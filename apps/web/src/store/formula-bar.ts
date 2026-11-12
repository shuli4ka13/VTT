import type { SheetNames } from '../ui/formula-chips.tsx';
import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';

export interface BarApi {
  write: (text: string) => void;
  dismiss: () => void;
}

export interface BarOption {
  group: string;
  label: string;
  name?: string;
  onPick: (insert: (piece: string) => string, bar: BarApi) => void;
}

export interface FormulaTarget {
  id: string;
  where: string;
  table?: string;
  value: string;
  system: System;
  names?: Record<string, ReactNode>;
  extraNames?: Map<string, string>;
  meanings?: Map<string, string>;
  badges?: Map<string, string>;
  sheets?: SheetNames;
  whole?: boolean;
  placeholder?: string;
  options?: BarOption[];
  onChange?: (text: string) => void;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
}

type Opened = FormulaTarget & { initial: string };

const settle = (target: Opened | null) => {
  if (target && target.value !== target.initial) target.onCommit?.(target.value);
};

export interface FormulaBarState {
  target: Opened | null;
  hosts: number;
  open: (target: FormulaTarget) => void;
  write: (text: string) => void;
  commit: () => void;
  cancel: () => void;
  dismiss: () => void;
  host: () => () => void;
}

export const useFormulaBar = create<FormulaBarState>()((set, get) => ({
  target: null,
  hosts: 0,
  open: target => {
    const previous = get().target;
    if (previous?.id === target.id) return;
    set({ target: { ...target, initial: target.value } });
    settle(previous);
  },
  write: text => {
    const target = get().target;
    if (!target) return;
    target.onChange?.(text);
    set({ target: { ...target, value: text } });
  },
  commit: () => {
    const target = get().target;
    set({ target: null });
    settle(target);
  },
  cancel: () => {
    const target = get().target;
    set({ target: null });
    target?.onCancel?.();
  },
  dismiss: () => set({ target: null }),
  host: () => {
    set(state => ({ hosts: state.hosts + 1 }));
    return () => set(state => ({ hosts: state.hosts - 1, target: state.hosts <= 1 ? null : state.target }));
  },
}));
