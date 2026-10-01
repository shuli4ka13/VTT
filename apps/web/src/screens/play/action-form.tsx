import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Verdict } from '../../ui/primitives.tsx';
import { asksOf, askKindOf, checkInputs, choicesOf, normalizeInputs } from '@vtt/engine/model/asks';
import type { AskedParam } from '@vtt/engine/model/asks';
import { newPass } from '@vtt/engine/engine/calc';
import type { System, Compendium, Sheet } from '@vtt/schema';

export interface ActionRequest {
  actionId: string;
  inputs?: Record<string, number | string>;
  edits?: string[];
  targetEdits?: string[];
}

export function ActionForm({ system, compendium, actor, actionId, label, disabled, onAct, expect }: {
  system: System;
  compendium: Compendium;
  actor?: Sheet;
  actionId: string;
  label: string;
  disabled?: boolean;
  onAct: (request: ActionRequest) => void;
  expect?: (request: ActionRequest) => string | null;
}) {
  const asked = useMemo<AskedParam[]>(() => {
    try { return asksOf(actionId, { system, compendium }); } catch { return []; }
  }, [system, compendium, actionId]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [trouble, setTrouble] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  const send = () => {
    const given: Record<string, number | string> = {};
    for (const param of asked) {
      const value = answers[param.key];
      if (value !== undefined && value !== '') given[param.key] = value;
    }
    let problem: string | null;
    try {
      problem = checkInputs(asked, given, system, actor ? newPass(system, actor, { compendium }) : undefined);
    } catch (err) {
      problem = (err as Error).message;
    }
    if (problem) { setTrouble(problem); return; }
    setTip(null);
    setTrouble(null);
    onAct({ actionId, ...(asked.length ? { inputs: normalizeInputs(asked, given) } : {}) });
    setAnswers({});
    setOpen(false);
  };

  const guess = () => {
    if (!expect) return;
    const given: Record<string, number | string> = {};
    for (const param of asked) {
      const value = answers[param.key];
      if (value !== undefined && value !== '') given[param.key] = value;
    }
    let problem: string | null;
    try {
      problem = checkInputs(asked, given, system, actor ? newPass(system, actor, { compendium }) : undefined);
    } catch (err) {
      problem = (err as Error).message;
    }
    if (problem) { setTip(null); return; }
    const text = expect({ actionId, ...(asked.length ? { inputs: normalizeInputs(asked, given) } : {}) });
    setTip(text ? `Ожидание — кости по среднему, на вопросы «нет»:\n${text}` : null);
  };

  if (!asked.length) {
    return <Button variant="primary" disabled={disabled} onClick={send} onMouseEnter={guess} title={tip ?? undefined}>{label}</Button>;
  }

  if (!open) {
    return (
      <Button
        variant="primary" disabled={disabled}
        title={`спросит перед броском: ${asked.map(p => p.label ?? p.key).join(', ')}`}
        onClick={() => setOpen(true)}
      >
        {label}…
      </Button>
    );
  }

  return (
    <div className="stack stack--tight action-form">
      <div className="inline inline--tight">
        <span className="field__label spacer">{label} · перед броском</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>свернуть</Button>
      </div>
      {asked.map(param => (
        <Field
          key={param.key}
          label={`${param.label ?? param.key}${param.ask.by === 'gm' ? ' · говорит ведущий' : ''}`}
          hint={param.ask.hint}
        >
          {askKindOf(param) === 'choice'
            ? (
              <Select
                value={answers[param.key] ?? ''}
                options={[['', '— какой вариант —'],
                  ...choicesOf(system, param).map((option: string) => [option, option] as const)] as never}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))}
              />
            )
            : (
              <Input
                type={askKindOf(param) === 'number' ? 'number' : 'text'}
                value={answers[param.key] ?? ''}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))}
              />
            )}
        </Field>
      ))}
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      <Button variant="primary" disabled={disabled} onClick={send} onMouseEnter={guess} title={tip ?? undefined}>{label}</Button>
    </div>
  );
}
