import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Verdict } from '../../ui/primitives.tsx';
import { asksOf, askKindOf, checkInputs, choicesOf, isPerTarget, normalizeInputs, YES_NO } from '@vtt/engine/model/asks';
import type { AskedParam, Inputs } from '@vtt/engine/model/asks';
import { newPass } from '@vtt/engine/engine/calc';
import type { System, Compendium, Sheet } from '@vtt/schema';

export interface ActionRequest {
  actionId: string;
  inputs?: Inputs;
}

type Answer = string | Record<string, string>;

export function ActionForm({ system, compendium, actor, targets = [], actionId, label, disabled, onAct, expect }: {
  system: System;
  compendium: Compendium;
  actor?: Sheet;
  targets?: readonly { id: string; name: string }[];
  actionId: string;
  label: string;
  disabled?: boolean;
  onAct: (request: ActionRequest) => void;
  expect?: (request: ActionRequest) => string | null;
}) {
  const asked = useMemo<AskedParam[]>(() => {
    try { return asksOf(actionId, { system, compendium }); } catch { return []; }
  }, [system, compendium, actionId]);

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const ids = targets.map(target => target.id);

  const collect = (): Inputs => {
    const given: Inputs = {};
    for (const param of asked) {
      const value = answers[param.key];
      if (isPerTarget(param)) {
        const each = Object.fromEntries(ids.map(id => [id, (value as Record<string, string> | undefined)?.[id] ?? '']).filter(([, one]) => one !== ''));
        given[param.key] = each;
      } else if (typeof value === 'string' && value !== '') given[param.key] = value;
    }
    return given;
  };
  const problemOf = (given: Inputs): string | null => {
    try {
      return checkInputs(asked, given, system, actor ? newPass(system, actor, { compendium }) : undefined, ids);
    } catch (err) {
      return (err as Error).message;
    }
  };
  const [trouble, setTrouble] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  const send = () => {
    const given = collect();
    const problem = problemOf(given);
    if (problem) { setTrouble(problem); return; }
    setTip(null);
    setTrouble(null);
    onAct({ actionId, ...(asked.length ? { inputs: normalizeInputs(asked, given) } : {}) });
    setAnswers({});
    setOpen(false);
  };

  const guess = () => {
    if (!expect) return;
    const given = collect();
    if (problemOf(given)) { setTip(null); return; }
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
      {asked.map(param => {
        const title = `${param.label ?? param.key}${param.ask.by === 'gm' ? ' · говорит ведущий' : ''}`;
        if (!isPerTarget(param)) {
          return (
            <Field key={param.key} label={title} hint={param.ask.hint}>
              <AskInput system={system} param={param} value={(answers[param.key] as string | undefined) ?? ''}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))} />
            </Field>
          );
        }
        if (!targets.length) {
          return <Field key={param.key} label={title} hint="спросит для каждой цели — сначала выберите цели">{null}</Field>;
        }
        const each = (answers[param.key] as Record<string, string> | undefined) ?? {};
        return targets.map(target => (
          <Field key={`${param.key}|${target.id}`} label={`${title} · ${target.name}`} hint={param.ask.hint}>
            <AskInput system={system} param={param} value={each[target.id] ?? ''}
              onChange={next => setAnswers(all => ({ ...all, [param.key]: { ...((all[param.key] as Record<string, string> | undefined) ?? {}), [target.id]: next } }))} />
          </Field>
        ));
      })}
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      <Button variant="primary" disabled={disabled} onClick={send} onMouseEnter={guess} title={tip ?? undefined}>{label}</Button>
    </div>
  );
}

function AskInput({ system, param, value, onChange }: {
  system: System; param: AskedParam; value: string; onChange: (next: string) => void;
}) {
  const kind = askKindOf(param);
  return kind === 'choice' || kind === 'boolean'
    ? (
      <Select
        value={value}
        options={[['', '— какой вариант —'],
          ...(kind === 'boolean' ? [...YES_NO] : choicesOf(system, param)).map((option: string) => [option, option] as const)] as never}
        onChange={onChange}
      />
    )
    : <Input type={kind === 'number' ? 'number' : 'text'} value={value} onChange={onChange} />;
}
