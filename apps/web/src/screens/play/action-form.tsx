import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Verdict } from '../../ui/primitives.tsx';
import { asksOf, checkInputs, normalizeInputs } from '@vtt/engine/model/asks';
import type { AskedParam } from '@vtt/engine/model/asks';
import type { System, Compendium } from '@vtt/schema';

export interface ActionRequest {
  actionId: string;
  inputs?: Record<string, number | string>;
  edits?: string[];
  targetEdits?: string[];
}

export function ActionForm({ system, compendium, actionId, label, disabled, onAct }: {
  system: System;
  compendium: Compendium;
  actionId: string;
  label: string;
  disabled?: boolean;
  onAct: (request: ActionRequest) => void;
}) {
  const asked = useMemo<AskedParam[]>(() => {
    try { return asksOf(actionId, { system, compendium }); } catch { return []; }
  }, [system, compendium, actionId]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [trouble, setTrouble] = useState<string | null>(null);

  const send = () => {
    const given: Record<string, number | string> = {};
    for (const param of asked) {
      const value = answers[param.key];
      if (value !== undefined && value !== '') given[param.key] = value;
    }
    const problem = checkInputs(asked, given);
    if (problem) { setTrouble(problem); return; }
    setTrouble(null);
    onAct({ actionId, ...(asked.length ? { inputs: normalizeInputs(asked, given) } : {}) });
    setAnswers({});
  };

  if (!asked.length) {
    return <Button variant="primary" disabled={disabled} onClick={send}>{label}</Button>;
  }

  return (
    <div className="stack stack--tight action-form">
      <span className="field__label">{label} · перед броском</span>
      {asked.map(param => (
        <Field
          key={param.key}
          label={`${param.label ?? param.key}${param.ask.by === 'gm' ? ' · говорит ведущий' : ''}`}
          hint={param.ask.hint}
        >
          {(param.ask.kind ?? 'number') === 'choice'
            ? (
              <Select
                value={answers[param.key] ?? ''}
                options={[['', '— какой вариант —'], ...(param.ask.options ?? []).map(option => [option, option] as const)] as never}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))}
              />
            )
            : (
              <Input
                type={(param.ask.kind ?? 'number') === 'number' ? 'number' : 'text'}
                value={answers[param.key] ?? ''}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))}
              />
            )}
        </Field>
      ))}
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      <Button variant="primary" disabled={disabled} onClick={send}>{label}</Button>
    </div>
  );
}
