import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Verdict } from '../../ui/primitives.tsx';
import { asksOf, askKindOf, checkInputs, choicesOf, isPerTarget, normalizeInputs, YES_NO, newPass, distanceOf, distanceWords, measuredValue } from '@vtt/engine';
import type { AskedParam, Inputs } from '@vtt/engine';
import type { System, Compendium, Sheet, Places } from '@vtt/schema';

export interface ActionRequest {
  actionId: string;
  inputs?: Inputs;
}

type Answer = string | Record<string, string>;

export function ActionForm({ system, compendium, actor, targets = [], actionId, label, disabled, blocked, refuse, onAct, expect, places }: {
  system: System;
  compendium: Compendium;
  actor?: Sheet;
  targets?: readonly { id: string; name: string }[];
  actionId: string;
  label: string;
  disabled?: boolean;
  blocked?: string | null;
  refuse?: (request: ActionRequest) => string | null;
  onAct: (request: ActionRequest) => void;
  expect?: (request: ActionRequest) => string | null;
  places?: Places;
}) {
  const asked = useMemo<AskedParam[]>(() => {
    try { return asksOf(actionId, { system, compendium }); } catch { return []; }
  }, [system, compendium, actionId]);

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const ids = targets.map(target => target.id);

  const measured = useMemo(() => {
    const out: Record<string, { value: Answer; words: Record<string, string> }> = {};
    if (!actor || !system.grid) return out;
    for (const param of asked) {
      if (!param.measure) continue;
      const each: Record<string, string> = {};
      const words: Record<string, string> = {};
      for (const target of targets) {
        const distance = distanceOf(system, places, actor.id, target.id);
        if (distance === null) continue;
        const value = measuredValue(system, param, distance);
        if (value === null) continue;
        each[target.id] = String(value);
        words[target.id] = distanceWords(system, distance);
      }
      const first = targets[0] ? each[targets[0].id] : undefined;
      if (isPerTarget(param)) { if (Object.keys(each).length) out[param.key] = { value: each, words }; }
      else if (first !== undefined && targets[0]) out[param.key] = { value: first, words: { '': words[targets[0].id]! } };
    }
    return out;
  }, [asked, system, places, actor, targets]);

  const answerOf = (param: AskedParam): Answer | undefined => {
    const own = answers[param.key];
    const auto = measured[param.key]?.value;
    if (isPerTarget(param)) return { ...((auto as Record<string, string> | undefined) ?? {}), ...((own as Record<string, string> | undefined) ?? {}) };
    return own ?? auto;
  };

  const collect = (): Inputs => {
    const given: Inputs = {};
    for (const param of asked) {
      const value = answerOf(param);
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
    return <Button variant="primary" disabled={disabled || Boolean(blocked)} onClick={send} onMouseEnter={guess} title={blocked ?? tip ?? undefined}>{label}</Button>;
  }

  if (!open) {
    return (
      <Button
        variant="primary" disabled={disabled || Boolean(blocked)}
        title={blocked ?? `спросит перед броском: ${asked.map(p => p.label ?? p.key).join(', ')}`}
        onClick={() => setOpen(true)}
      >
        {label}…
      </Button>
    );
  }

  const given = collect();
  const unpaid = refuse && !problemOf(given) ? refuse({ actionId, inputs: normalizeInputs(asked, given) }) : null;

  return (
    <div className="stack stack--tight action-form">
      <div className="inline inline--tight">
        <span className="field__label spacer">{label} · перед броском</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>свернуть</Button>
      </div>
      {asked.map(param => {
        const title = `${param.label ?? param.key}${param.ask.by === 'gm' ? ' · говорит ведущий' : ''}`;
        const hintFor = (key: string): string | undefined => {
          const words = measured[param.key]?.words[key];
          return [param.ask.hint, words ? `по полю: ${words}` : ''].filter(Boolean).join(' · ') || undefined;
        };
        if (!isPerTarget(param)) {
          return (
            <Field key={param.key} label={title} hint={hintFor('')}>
              <AskInput system={system} param={param} value={(answerOf(param) as string | undefined) ?? ''}
                onChange={next => setAnswers(all => ({ ...all, [param.key]: next }))} />
            </Field>
          );
        }
        if (!targets.length) {
          return <Field key={param.key} label={title} hint="спросит для каждой цели — сначала выберите цели">{null}</Field>;
        }
        const each = (answerOf(param) as Record<string, string> | undefined) ?? {};
        return targets.map(target => (
          <Field key={`${param.key}|${target.id}`} label={`${title} · ${target.name}`} hint={hintFor(target.id)}>
            <AskInput system={system} param={param} value={each[target.id] ?? ''}
              onChange={next => setAnswers(all => ({ ...all, [param.key]: { ...((all[param.key] as Record<string, string> | undefined) ?? {}), [target.id]: next } }))} />
          </Field>
        ));
      })}
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      {unpaid ? <Verdict tone="bad">{unpaid}</Verdict> : null}
      <Button variant="primary" disabled={disabled || Boolean(unpaid)} onClick={send} onMouseEnter={guess} title={unpaid ?? tip ?? undefined}>{label}</Button>
    </div>
  );
}

function AskInput({ system, param, value, onChange }: {
  system: System; param: AskedParam; value: string; onChange: (next: string) => void;
}) {
  const kind = askKindOf(param);
  const said = new Map((system.tables?.[String(param.from ?? '')]?.rows ?? []).map(row => [String(row.value), row.label || String(row.value)] as const));
  return kind === 'choice' || kind === 'boolean'
    ? (
      <Select
        value={value}
        options={[['', '— какой вариант —'],
          ...(kind === 'boolean' ? [...YES_NO] : choicesOf(system, param)).map((option: string) => [option, said.get(option) ?? option] as const)] as never}
        onChange={onChange}
      />
    )
    : <Input type={kind === 'number' ? 'number' : 'text'} value={value} onChange={onChange} />;
}
