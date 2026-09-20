import { Card, CardHead, Field, Select, Chip } from '../../../ui/primitives.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
import { MOMENTS as TIMES, MOMENT_PREFIX, FIELD_PREFIX, fieldOf } from '@vtt/engine/events/moments';
import type { MomentKey } from '@vtt/engine/events/moments';

import { MOMENTS } from './words.ts';
import type { Moment } from './words.ts';
import type { System, Effect } from '@vtt/schema';

function conditionsOf(system: System, listened: string | undefined): (readonly [string, string])[] {
  const source = listened ? system.effects[listened] : undefined;
  if (!source) return [];
  const out: (readonly [string, string])[] = [];
  (source.steps ?? []).forEach((step, index) => {
    if (!step.id) return;
    const mod = registry.get(step.type);
    for (const output of (mod?.outputs ?? []) as { path: string; label: string; kind?: string }[]) {
      if (output.kind !== 'boolean') continue;
      out.push([`${step.id}${output.path}`, `шаг ${index + 1} · ${output.label}`] as const);
    }
  });
  return out;
}

function conditionsOfAny(system: System): (readonly [string, string])[] {
  const seen = new Map<string, string>();
  for (const [key, effect] of Object.entries(system.effects)) {
    if ((effect.activation ?? 'manual') !== 'manual') continue;
    for (const [ref, label] of conditionsOf(system, key)) if (!seen.has(ref)) seen.set(ref, label);
  }
  return [...seen].map(([ref, label]) => [ref, label] as const);
}

export const momentOf = (effect: Effect): Moment => {
  if ((effect.activation ?? 'manual') === 'reaction') {
    return (effect.trigger?.window ?? 'target') === 'sender' ? 'ask-sender' : 'ask-target';
  }
  return effect.trigger?.direction === 'out' ? 'after-out' : 'after-in';
};

const applyMoment = (draft: Effect, moment: Moment): void => {
  const asks = moment === 'ask-target' || moment === 'ask-sender';
  const on = draft.trigger?.on ?? (asks ? '*' : '');
  draft.activation = asks ? 'reaction' : 'triggered';
  const kept = { on, ...(draft.trigger?.condition ? { condition: draft.trigger.condition } : {}) };
  draft.trigger = asks
    ? { ...kept, window: moment === 'ask-sender' ? 'sender' : 'target', ...(draft.trigger?.claims?.length ? { claims: draft.trigger.claims } : {}) }
    : { ...kept, ...(moment === 'after-out' ? { direction: 'out' as const, to: draft.trigger?.to === 'sender' ? 'self' as const : draft.trigger?.to } : {}) };
};

export function LaunchCard({ id, effect, system, edit }: {
  id: string;
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
}) {
  const moment = momentOf(effect);
  const asks = moment === 'ask-target' || moment === 'ask-sender';
  const listened = effect.trigger?.on;
  const anyAction = !listened || listened === '*';
  const isMoment = Boolean(listened?.startsWith(MOMENT_PREFIX)) || Boolean(fieldOf(listened));
  const conditions = isMoment ? [] : anyAction ? conditionsOfAny(system) : conditionsOf(system, listened);
  const watchable = system.fields.filter(f => f.value.kind !== 'stored' || f.value.type === 'boolean');

  return (
    <Card>
      <CardHead title="Когда срабатывает" sub="Эффект ждёт чужого действия или события и запускается сам." />

      <Field label="Момент">
        <Select
          value={moment}
          options={MOMENTS as never}
          onChange={next => edit(draft => { applyMoment(draft, next as Moment); })}
        />
      </Field>

      <div className="row">
        <Field label="Слушает" needed={!asks && !listened}>
          <Select
            value={listened ?? (asks ? '*' : '')}
            options={[
              ...(asks ? [['*', 'любое действие'] as const] : [['', '— выберите —'] as const]),
              ...Object.entries(system.events ?? {})
                .map(([key, e]) => [`event:${key}`, `общий эффект «${e.label || key}»`] as const),
              ...Object.entries(system.effects)
                .filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual')
                .map(([key, e]) => [key, e.label ?? key] as const),
              ...(asks ? [] : (Object.keys(TIMES) as MomentKey[])
                .map(key => [`${MOMENT_PREFIX}${key}`, `время: ${TIMES[key]}`] as const)),
              ...(asks ? [] : watchable
                .map(f => [`${FIELD_PREFIX}${f.tag}`, `поле «${f.label}» стало верным`] as const)),
            ] as never}
            onChange={next => edit(draft => {
              draft.trigger = { ...(draft.trigger ?? {}), on: next || (asks ? '*' : '') };
            })}
          />
        </Field>

        <Field
          label="Только если"
          hint={isMoment
            ? 'У времени и поля нет исходов — сработает всегда.'
            : conditions.length ? undefined : 'У того, кого слушаем, нет шагов с исходом «да/нет» — сработает всегда.'}
        >
          <Select
            value={String((effect.trigger?.condition as { ref?: string })?.ref ?? '')}
            options={[['', 'всегда'], ...conditions] as never}
            onChange={next => edit(draft => {
              draft.trigger = { ...(draft.trigger ?? { on: '' }), condition: next ? { ref: next } : null };
            })}
          />
        </Field>

        {asks || isMoment ? null : (
          <Field label="Кому" hint="Куда уходит цепочка шагов этого эффекта.">
            <Select
              value={String(effect.trigger?.to ?? (moment === 'after-out' ? 'self' : 'sender'))}
              options={(moment === 'after-out'
                ? [['self', 'себе'], ['target', 'цели моего действия']]
                : [['sender', 'тому, кто действовал — ответкой'], ['self', 'себе']]) as never}
              onChange={next => edit(draft => {
                draft.trigger = { ...(draft.trigger ?? { on: '' }), to: next === 'sender' ? undefined : next as 'self' | 'target' };
              })}
            />
          </Field>
        )}
      </div>

      {moment === 'ask-sender' ? (
        <Field label="Перебросить с правкой" hint="Если выбрано — после согласия бросок собирается заново с этими правками из словаря.">
          <div className="inline inline--tight">
            {Object.entries(system.roll_edits ?? {}).map(([key, e]) => {
              const picked = (effect.trigger?.claims ?? []).includes(key);
              return (
                <Chip key={key} active={picked} onClick={() => edit(draft => {
                  const list = new Set(draft.trigger?.claims ?? []);
                  if (picked) list.delete(key); else list.add(key);
                  draft.trigger = { ...(draft.trigger ?? { on: '*' }), claims: [...list] };
                })}>
                  {e.label || key}
                </Chip>
              );
            })}
            {Object.keys(system.roll_edits ?? {}).length === 0
              ? <span className="faint">Правок броска в словаре нет.</span> : null}
          </div>
        </Field>
      ) : null}
    </Card>
  );
}
