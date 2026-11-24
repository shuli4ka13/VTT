import { create } from 'zustand';
import type { Effect } from '@vtt/schema';

export const GLUE_MS = 700;

interface Meta { at: number; typing: boolean }

export interface Stack { states: Effect[]; meta: Meta[]; at: number }

interface UndoState {
  stacks: Record<string, Stack>;
  record: (id: string, before: Effect, after: Effect, now: number, typing?: boolean) => void;
  undo: (id: string, current: Effect | undefined) => Effect | null;
  redo: (id: string, current: Effect | undefined) => Effect | null;
  landed: (id: string, effect: Effect) => void;
  canUndo: (id: string, current: Effect | undefined) => boolean;
  canRedo: (id: string, current: Effect | undefined) => boolean;
  clear: (id?: string) => void;
}

const fresh = (state: Effect): Stack => ({ states: [state], meta: [{ at: 0, typing: false }], at: 0 });

const live = (stack: Stack | undefined, current: Effect | undefined): stack is Stack =>
  Boolean(stack && current && stack.states[stack.at] === current);

const textChanges = (before: unknown, after: unknown): number => {
  if (typeof before === 'string' && typeof after === 'string') return before === after ? 0 : 1;
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') return before === after ? 0 : Infinity;
  if (Array.isArray(before) !== Array.isArray(after)) return Infinity;
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return Infinity;
  let out = 0;
  for (const key of keys) {
    if (!(key in right)) return Infinity;
    out += textChanges(left[key], right[key]);
    if (out > 1) return Infinity;
  }
  return out;
};

export const isTyping = (before: unknown, after: unknown): boolean => textChanges(before, after) === 1;

const LIMIT = 100;

export const useEffectUndo = create<UndoState>()((set, get) => ({
  stacks: {},
  record: (id, before, after, now, typing = false) => {
    const known = get().stacks[id];
    const base = live(known, before) ? known : fresh(before);
    const keep = base.at + 1;
    const states = base.states.slice(0, keep);
    const meta = base.meta.slice(0, keep);
    const last = meta[base.at]!;
    if (typing && last.typing && base.at > 0 && now - last.at < GLUE_MS) {
      states[base.at] = after;
      meta[base.at] = { at: now, typing: true };
      set(state => ({ stacks: { ...state.stacks, [id]: { states, meta, at: base.at } } }));
      return;
    }
    states.push(after);
    meta.push({ at: now, typing });
    const extra = Math.max(0, states.length - LIMIT);
    set(state => ({ stacks: { ...state.stacks, [id]: { states: states.slice(extra), meta: meta.slice(extra), at: states.length - 1 - extra } } }));
  },
  undo: (id, current) => {
    const stack = get().stacks[id];
    if (!live(stack, current)) {
      if (stack) get().clear(id);
      return null;
    }
    if (stack.at === 0) return null;
    const meta = stack.meta.slice();
    meta[stack.at - 1] = { at: 0, typing: false };
    set(state => ({ stacks: { ...state.stacks, [id]: { ...stack, meta, at: stack.at - 1 } } }));
    return stack.states[stack.at - 1]!;
  },
  redo: (id, current) => {
    const stack = get().stacks[id];
    if (!live(stack, current)) {
      if (stack) get().clear(id);
      return null;
    }
    if (stack.at >= stack.states.length - 1) return null;
    const meta = stack.meta.slice();
    meta[stack.at + 1] = { at: 0, typing: false };
    set(state => ({ stacks: { ...state.stacks, [id]: { ...stack, meta, at: stack.at + 1 } } }));
    return stack.states[stack.at + 1]!;
  },
  landed: (id, effect) => {
    const stack = get().stacks[id];
    if (!stack) return;
    const states = stack.states.slice();
    states[stack.at] = effect;
    set(state => ({ stacks: { ...state.stacks, [id]: { ...stack, states } } }));
  },
  canUndo: (id, current) => {
    const stack = get().stacks[id];
    return live(stack, current) && stack.at > 0;
  },
  canRedo: (id, current) => {
    const stack = get().stacks[id];
    return live(stack, current) && stack.at < stack.states.length - 1;
  },
  clear: id => set(state => {
    if (id === undefined) return { stacks: {} };
    const { [id]: _gone, ...rest } = state.stacks;
    return { stacks: rest };
  }),
}));
