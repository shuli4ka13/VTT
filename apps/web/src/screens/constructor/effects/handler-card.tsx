import { Card, CardHead, Field, Select, Fold, DangerButton } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
import { MOMENTS as TIMES } from '@vtt/engine/events/moments';
import { MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX, PHASES, SEEN, SEEN_LABEL, ANY_ACTION, callHappening, happeningOf } from '@vtt/engine/events/bus';
import type { Phase } from '@vtt/engine/events/bus';
import type { MomentKey } from '@vtt/engine/events/moments';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { TARGETS_SEED } from '@vtt/engine/model/references';
import { handlerSheets, holderPhrase } from './names.ts';
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

const PHASE_OPTIONS = (Object.keys(PHASES) as Phase[]).map(key => [key, `${PHASES[key].label} — ${PHASES[key].note}`] as const);

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

function outcomesOf(system: System, listened: string): (readonly [string, string])[] {
  const source = system.effects[listened];
  if (!source) return [];
  const out: (readonly [string, string])[] = [];
  (source.steps ?? []).forEach((step, index) => {
    if (!step.id) return;
    for (const output of (registry.get(step.type)?.outputs ?? []) as { path: string; label: string; kind?: string }[]) {
      if (output.kind !== 'boolean') continue;
      out.push([`@${step.id}${output.path}`, `шаг ${index + 1} · ${output.label}`] as const);
    }
  });
  return out;
}

const splitIf = (expr: string | undefined, holders: string[]): { holder: string; rest: string } => {
  const text = (expr ?? '').trim();
  if (!text) return { holder: '', rest: '' };
  if (holders.includes(text)) return { holder: text, rest: '' };
  const both = /^все\((.*)\)$/su.exec(text);
  if (both) {
    const [first, ...others] = both[1]!.split(/,\s*/u);
    if (first && holders.includes(first.trim())) return { holder: first.trim(), rest: others.join(', ') };
  }
  return { holder: '', rest: text };
};

const joinIf = (holder: string, rest: string): string | null => {
  const parts = [holder, rest.trim()].filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : `все(${parts.join(', ')})`;
};

export function HandlerCard({ id, index, handler, system, edit, onRemove }: {
  id: string;
  index: number;
  handler: Handler;
  system: System;
  edit: (change: (draft: Handler) => void) => void;
  onRemove: () => void;
}) {
  const effect = system.effects[id]!;
  const kind = kindOf(handler.on ?? '');
  const subject = subjectOf(handler.on ?? '');
  const phase = callHappening(handler.on)?.phase ?? 'before';
  const sheets = handlerSheets(system, effect, handler);
  const names = [...sheets].filter(([name]) => name !== 'носитель');
  const holders = names.map(([name]) => holderPhrase(name));
  const { holder, rest } = splitIf(handler.if?.expr, holders);
  const outcomes = kind === 'call' && subject ? outcomesOf(system, subject) : [];
  const pickedOutcome = outcomes.find(([expr]) => expr === rest.trim())?.[0] ?? null;
  const formula = rest && !pickedOutcome ? rest : null;
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
  const setIf = (nextHolder: string, nextRest: string) => edit(draft => {
    const expr = joinIf(nextHolder, nextRest);
    if (expr) draft.if = { expr }; else delete draft.if;
  });

  return (
    <Card>
      <CardHead
        title={`Подписка №${index + 1}`}
        sub="На что откликается эффект, кого это касается и что он делает в ответ."
        actions={<DangerButton size="sm" onConfirm={onRemove}>Удалить</DangerButton>}
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
        <Field label="Кого касается" hint="Носитель — лист, на котором висит эта подписка.">
          <Select<string>
            value={holder}
            options={[['', 'всех — без условия'], ...names.map(([name, label]) => [holderPhrase(name), `«${label}» — носитель`] as const)]}
            onChange={next => setIf(next, rest)}
          />
        </Field>
        <Field label="Решение">
          <Select<string>
            value={handler.confirm ? 'ask' : ''}
            options={[['', 'срабатывает само'], ['ask', 'решает игрок носителя']]}
            onChange={next => edit(draft => { if (next) draft.confirm = true; else delete draft.confirm; })}
          />
        </Field>
      </div>

      <Fold title="Только если" summary={formula ? `если ${formula}` : pickedOutcome ? `если ${outcomes.find(([expr]) => expr === pickedOutcome)?.[1]}` : 'больше условий нет'}>
        <Field label="Ещё условие">
          <Select<string>
            value={formula !== null ? ':формула' : pickedOutcome ?? ''}
            options={[['', 'нет'], ...outcomes, [':формула', 'формулой…']]}
            onChange={next => setIf(holder, next === ':формула' ? (formula ?? '') || 'да' : next)}
          />
          {formula !== null ? (
            <FormulaField
              value={formula}
              system={system}
              where={`подписка №${index + 1} · только если`}
              sheets={sheets}
              {...(phase === 'done' && kind === 'call' ? { extraNames: new Map([[TARGETS_SEED, 'итоги по целям: строка на цель']]) } : {})}
              placeholder={phase === 'done' ? 'например: сколько(@итоги.hit.success, да) >= 1' : 'например: @носитель.хиты <= 0'}
              onCommit={next => setIf(holder, next)}
            />
          ) : null}
        </Field>
      </Fold>
    </Card>
  );
}
