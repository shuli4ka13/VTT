import { useState } from 'react';
import { Input } from '../../../../ui/primitives.tsx';
import { stepNameTrouble, applyName, loopNames, namedSteps, type NameKeys } from '../../keys.ts';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { stepSaid } from '@vtt/engine';
import { useT } from '../../../../i18n/author.ts';

export function useNameInput({ shown, check, onCommit, optional = false }: {
  shown: string;
  check: (typed: string) => string | null;
  onCommit: (typed: string) => void;
  optional?: boolean;
}) {
  const t = useT('stepCards');
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    if (optional && !draft.trim()) { setDraft(null); setTrouble(null); onCommit(''); return; }
    const found = check(draft);
    if (found) { setTrouble(found); return; }
    setDraft(null);
    setTrouble(null);
    if (draft.trim() !== shown) onCommit(draft);
  };
  const input = (
    <Input
      mono
      value={draft ?? shown}
      placeholder={t('name.placeholder')}
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

export function NameField(props: Parameters<typeof useNameInput>[0]) {
  const { input, trouble } = useNameInput(props);
  return <>{input}{trouble}</>;
}

export function useStepName({ step, context, edit, takenNames }: {
  step: { id?: unknown; label?: unknown };
  context: SlotContext;
  edit: EditFn;
  takenNames?: readonly string[] | undefined;
}) {
  const current = typeof step.id === 'string' ? step.id : '';
  const keys = takenNames ?? [
    ...context.earlier.map(one => one.id),
    ...(context.effect.params ?? []).map(p => p.key),
  ];
  const others = namedSteps(context.effect).filter(one => one.id !== current);
  return useNameInput({
    shown: current ? stepSaid(step) : '',
    check: typed => stepNameTrouble(typed, step, [...others, ...loopNames(context.effect)]),
    onCommit: typed => edit(0, target => applyName(target as unknown as Record<string, unknown>, STEP_KEYS, typed, keys)),
  });
}

export const STEP_KEYS: NameKeys = { key: 'id', label: 'label' };
export const LOOP_KEYS: NameKeys = { key: 'as', label: 'asLabel' };
