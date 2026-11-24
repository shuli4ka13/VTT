import { useCallback } from 'react';
import type { Effect } from '@vtt/schema';
import { useWorld } from '../../../../../store/world.ts';
import { useFormulaBar } from '../../../../../store/formula-bar.ts';
import { isTyping, useEffectUndo } from '../../../../../store/effect-undo.ts';

export type SunEdit = (change: (draft: Effect) => void, opts?: { typing?: boolean }) => void;

export interface SunEditing {
  edit: SunEdit;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const apply = (id: string, snapshot: Effect): void => {
  useFormulaBar.getState().dismiss();
  useWorld.getState().editEffect(id, draft => {
    for (const key of Object.keys(draft)) delete (draft as Record<string, unknown>)[key];
    Object.assign(draft, structuredClone(snapshot));
  });
  const landed = useWorld.getState().system.effects[id];
  if (landed) useEffectUndo.getState().landed(id, landed);
};

export function useSunEdit(id: string, now: () => number = Date.now): SunEditing {
  const current = useWorld(state => state.system.effects[id]);
  const stack = useEffectUndo(state => state.stacks[id]);
  const edit = useCallback<SunEdit>((change, opts) => {
    useFormulaBar.getState().flush();
    const before = useWorld.getState().system.effects[id];
    if (!before) return;
    useWorld.getState().editEffect(id, change);
    const after = useWorld.getState().system.effects[id];
    if (!after || after === before) return;
    if (JSON.stringify(after) === JSON.stringify(before)) {
      const held = useEffectUndo.getState().stacks[id];
      if (held && held.states[held.at] === before) useEffectUndo.getState().landed(id, after);
      return;
    }
    useEffectUndo.getState().record(id, before, after, now(), opts?.typing ?? isTyping(before, after));
  }, [id, now]);
  const undo = useCallback((): boolean => {
    const snapshot = useEffectUndo.getState().undo(id, useWorld.getState().system.effects[id]);
    if (!snapshot) return false;
    apply(id, snapshot);
    return true;
  }, [id]);
  const redo = useCallback((): boolean => {
    const snapshot = useEffectUndo.getState().redo(id, useWorld.getState().system.effects[id]);
    if (!snapshot) return false;
    apply(id, snapshot);
    return true;
  }, [id]);
  const state = useEffectUndo.getState();
  return {
    edit, undo, redo,
    canUndo: Boolean(stack) && state.canUndo(id, current),
    canRedo: Boolean(stack) && state.canRedo(id, current),
  };
}
