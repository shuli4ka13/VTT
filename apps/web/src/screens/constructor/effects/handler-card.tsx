import { groupSteps } from '../cards.ts';
import { useState } from 'react';
import { Card, CardHead, Field, Select, DangerButton, Button } from '../../../ui/primitives.tsx';
import { formulaWords } from '../../../ui/formula-words.ts';
import { registry } from '@vtt/engine/engine/steps/index';
import { MOMENTS as TIMES } from '@vtt/engine/events/moments';
import { MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX, PHASES, SEEN, SEEN_LABEL, ANY_ACTION, callHappening, happeningOf } from '@vtt/engine/events/bus';
import type { Phase } from '@vtt/engine/events/bus';
import type { MomentKey } from '@vtt/engine/events/moments';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { TARGETS_SEED } from '@vtt/engine/model/references';
import { sheetsAt } from './names.ts';
import { namesAt } from '@vtt/engine/model/names-at';
import { ConditionField } from '../condition-field.tsx';
import type { System, Handler } from '@vtt/schema';

type Kind = 'call' | 'seen' | 'moment' | 'field' | 'gained' | 'lost';

const KINDS: readonly (readonly [Kind, string])[] = [
  ['call', 'действие или вызов'],
  ['seen', SEEN_LABEL],
  ['moment', 'время'],
  ['field', 'поле стало верным'],
  ['gained', 'эффект появился на листе'],
  ['lost', 'эффект ушёл с листа'],
];

const PHASE_OPTIONS = (Object.keys(PHASES) as Phase[]).map(key => [key, PHASES[key].label] as const);

const kindOf = (on: string): Kind => {
  if (on === SEEN) return 'seen';
  if (on.startsWith(MOMENT_PREFIX)) return 'moment';
  if (on.startsWith(FIELD_PREFIX)) return 'field';
  if (on.startsWith(GAINED_PREFIX)) return 'gained';
  if (on.startsWith(LOST_PREFIX)) return 'lost';
  return 'call';
};

const subjectOf = (on: string): string => {
  const call = callHappening(on);
  if (call) return call.of;
  const at = on.indexOf(':');
  return at > 0 ? on.slice(at + 1) : '';
};

const PREFIX: Record<Exclude<Kind, 'call' | 'seen'>, string> = {
  moment: MOMENT_PREFIX, field: FIELD_PREFIX, gained: GAINED_PREFIX, lost: LOST_PREFIX,
};

function outcomesOf(system: System, listened: string, phase: Phase): (readonly [string, string])[] {
  const source = system.effects[listened];
  if (!source) return [];
  const steps = source.steps ?? [];
  const split = steps.findIndex(step => step.type === 'each');
  const out: (readonly [string, string])[] = [];
  const cards = groupSteps(steps);
  const numberOf = (index: number) => cards.filter(card => card.kind !== 'flow').findIndex(card => card.indices.includes(index)) + 1;
  steps.forEach((step, index) => {
    if (!step.id) return;
    const perTarget = phase === 'done' && split >= 0 && index > split;
    for (const output of (registry.get(step.type)?.outputs ?? []) as { path: string; label: string; kind?: string }[]) {
      if (output.kind !== 'boolean') continue;
      out.push(perTarget
        ? [`сколько(@${TARGETS_SEED}.${step.id}${output.path}, да) >= 1`, `хоть по одной цели: шаг ${numberOf(index)} · ${output.label}`] as const
        : [`@${step.id}${output.path}`, `шаг ${numberOf(index)} · ${output.label}`] as const);
    }
  });
  return out;
}

export function HandlerCard({ id, index, handler, system, edit, onRemove, startOpen = false }: {
  startOpen?: boolean;
  id: string;
  index: number;
  handler: Handler;
  system: System;
  edit: (change: (draft: Handler) => void) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!handler.on || startOpen);
  const kind = kindOf(handler.on ?? '');
  const subject = subjectOf(handler.on ?? '');
  const phase = callHappening(handler.on)?.phase ?? 'before';
  const sheets = sheetsAt(system, id, { part: 'handler-if', handler: index });
  const names = [...sheets].filter(([name]) => name !== 'носитель');
  const outcomes = kind === 'call' && subject ? outcomesOf(system, subject, phase) : [];
  const watchable = fieldsOf(system).filter(f => f.value.kind !== 'stored' || f.value.type === 'boolean');
  const hanging = Object.entries(system.effects).filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'passive');
  const actions = Object.entries(system.effects).filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual');
  const tags = Object.entries(system.tags ?? {});

  const subjects: (readonly [string, string])[] = kind === 'call'
    ? [[ANY_ACTION, 'любое действие кнопкой'], ...tags.map(([key, tag]) => [key, `всё с меткой «${tag.label ?? key}»`] as const), ...actions.map(([key, e]) => [key, `«${e.label ?? key}»`] as const)]
    : kind === 'moment' ? (Object.keys(TIMES) as MomentKey[]).map(key => [key, TIMES[key]] as const)
      : kind === 'field' ? watchable.map(f => [f.tag, `«${f.label}»`] as const)
        : kind === 'gained' || kind === 'lost' ? hanging.map(([key, e]) => [key, `«${e.label ?? key}»`] as const)
          : [];

  const setOn = (nextKind: Kind, nextSubject: string, nextPhase: Phase) => edit(draft => {
    draft.on = nextKind === 'seen' ? SEEN
      : nextKind === 'call' ? happeningOf(nextPhase, nextSubject || ANY_ACTION)
        : `${PREFIX[nextKind]}${nextSubject}`;
    delete draft.if;
  });
  const setIf = (expr: string | null) => edit(draft => {
    if (expr) draft.if = { expr }; else delete draft.if;
  });
  const visible = new Map(namesAt(system, id, { part: 'handler-if', handler: index }).map(one => [one.name, one.label]));

  const subjectWord = subjects.find(([key]) => key === subject)?.[1] ?? subject;
  const happened = kind === 'seen' ? SEEN_LABEL
    : kind === 'call' ? `${PHASES[phase].label} ${subjectWord}`
      : kind === 'moment' ? subjectWord
        : kind === 'field' ? `${subjectWord} стало верным`
          : kind === 'gained' ? `появился ${subjectWord}` : `ушёл ${subjectWord}`;
  const condition = (() => {
    const text = handler.if?.expr?.trim();
    if (!text) return '';
    const parts = text.replace(/^все\((.*)\)$/su, '$1').split(/,\s*(?![^()]*\))/u);
    return parts.map(part => {
      const holder = /^@([\p{L}\p{N}_]+)\s*==\s*@носитель$/u.exec(part.trim())?.[1];
      const label = holder ? names.find(([name]) => name === holder)?.[1] : undefined;
      return label ? `«${label}» — носитель` : formulaWords(system, part.trim(), visible);
    }).join(' и ');
  })();
  const sentence = `${happened || 'что случилось?'}${condition ? `, если ${condition}` : ''}${handler.confirm ? ' — решает игрок носителя' : ''}`;

  if (!open) {
    return (
      <div className="mod-row mod-row--when">
        <button type="button" className="mod-row__text" aria-label={`развернуть «когда: ${sentence}»`} onClick={() => setOpen(true)}>
          <span className="mod-row__kind">когда</span>
          {sentence}
        </button>
        <DangerButton size="sm" onConfirm={onRemove}>×</DangerButton>
      </div>
    );
  }

  return (
    <Card>
      <CardHead
        title={`Когда №${index + 1}: ${sentence}`}
        actions={<>
          <Button size="sm" variant="ghost" ariaLabel={`свернуть «когда: ${sentence}»`} onClick={() => setOpen(false)}>свернуть</Button>
          <DangerButton size="sm" onConfirm={onRemove}>Удалить</DangerButton>
        </>}
      />

      <div className="row">
        <Field label="Что случилось" needed={!handler.on}>
          <Select<Kind>
            value={kind}
            options={KINDS}
            onChange={next => setOn(next, '', 'before')}
          />
        </Field>
        {kind === 'seen' ? null : (
          <Field label={kind === 'call' ? 'Что именно' : kind === 'moment' ? 'Когда' : 'Какое'} needed={!subject}>
            <Select<string>
              value={subject}
              options={[...(subject ? [] : [['', '— выберите —'] as const]), ...subjects]}
              onChange={next => setOn(kind, next, phase)}
            />
          </Field>
        )}
        {kind === 'call' ? (
          <Field label="Когда именно" hint={PHASES[phase].note}>
            <Select<Phase> value={phase} options={PHASE_OPTIONS} onChange={next => setOn(kind, subject, next)} />
          </Field>
        ) : null}
      </div>

      <div className="row">
        <ConditionField
          value={handler.if?.expr}
          onChange={setIf}
          system={system}
          holders={names.map(([name, label]) => [name, `«${label}» — носитель`] as const)}
          phrases={outcomes.map(([expr, label]) => ({ expr, label }))}
          names={visible}
          sheets={sheets}
          where={`подписка №${index + 1} · только если`}
          placeholder={phase === 'done' ? 'например: сколько(@итоги.шаг.success, да) >= 1' : 'например: @носитель.поле <= 0'}
          holderHint="Носитель — лист, на котором висит эта подписка."
        />
        <Field label="Решение">
          <Select<string>
            value={handler.confirm ? 'ask' : ''}
            options={[['', 'срабатывает само'], ['ask', 'решает игрок носителя']]}
            onChange={next => edit(draft => { if (next) draft.confirm = true; else delete draft.confirm; })}
          />
        </Field>
      </div>
    </Card>
  );
}
