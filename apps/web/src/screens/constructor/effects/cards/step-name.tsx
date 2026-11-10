import { useState } from 'react';
import { Input } from '../../../../ui/primitives.tsx';
import { stepNameTrouble, keyOf } from '../../keys.ts';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

export function useStepName({ current, context, edit, takenNames, onRename }: {
  current: string;
  context: SlotContext;
  edit: EditFn;
  takenNames?: readonly string[] | undefined;
  onRename?: ((from: string, to: string) => void) | undefined;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const taken = takenNames ?? [
    ...context.earlier.map(one => one.id),
    ...(context.effect.params ?? []).map(p => p.key),
  ];
  const commit = () => {
    if (draft === null) return;
    const found = stepNameTrouble(draft, current, taken.filter(one => one !== current));
    if (found) { setTrouble(found); return; }
    const next = keyOf(draft);
    setDraft(null);
    setTrouble(null);
    if (next === current) return;
    if (onRename) onRename(current, next);
    else edit(0, target => { target.id = next; });
  };
  const input = (
    <Input
      mono
      value={draft ?? current}
      placeholder="имя"
      invalid={Boolean(trouble)}
      onChange={next => { setTrouble(null); setDraft(next); }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') { setDraft(null); setTrouble(null); }
      }}
    />
  );
  return { input, trouble: trouble ? <span className="field__error">{trouble}</span> : null };
}
