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

type Opened = FormulaTarget & { initial: string; final?: string };

let busy = 0;

const quiet = (run: () => void): void => {
  busy++;
  try { run(); } finally { busy--; }
};

const settle = (target: Opened | null) => {
  if (!target) return;
  const value = target.final ?? target.value;
  quiet(() => {
    if (value !== target.value) target.onChange?.(value);
    if (value !== target.initial) target.onCommit?.(value);
  });
};

export interface FormulaBarState {
  target: Opened | null;
  hosts: number;
  open: (target: FormulaTarget) => void;
  write: (text: string) => void;
  settleAs: (text: string) => void;
  commit: () => void;
  flush: () => void;
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
    quiet(() => target.onChange?.(text));
    const { final: _final, ...rest } = target;
    set({ target: { ...rest, value: text } });
  },
  settleAs: text => {
    const target = get().target;
    if (target) set({ target: { ...target, final: text } });
  },
  commit: () => {
    const target = get().target;
    set({ target: null });
    settle(target);
  },
  flush: () => {
    if (busy) return;
    get().commit();
  },
  cancel: () => {
    const target = get().target;
    set({ target: null });
    quiet(() => target?.onCancel?.());
  },
  dismiss: () => set({ target: null }),
  host: () => {
    set(state => ({ hosts: state.hosts + 1 }));
    return () => set(state => ({ hosts: state.hosts - 1, target: state.hosts <= 1 ? null : state.target }));
  },
}));
