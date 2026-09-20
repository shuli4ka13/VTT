import { Card, CardHead, Field, Select, Chip } from '../../../ui/primitives.tsx';
import { registry } from '@vtt/engine/engine/steps/index';
import type { System, Effect, Activation } from '@vtt/schema';

function conditionsOf(system: System, listened: string | undefined): (readonly [string, string])[] {
  const source = listened ? system.effects[listened] : undefined;
  if (!source) return [];
  const out: (readonly [string, string])[] = [];
  for (const step of source.steps ?? []) {
    if (!step.id) continue;
    const mod = registry.get(step.type);
    for (const output of (mod?.outputs ?? []) as { path: string; label: string; kind?: string }[]) {
      if (output.kind !== 'boolean') continue;
      out.push([`${step.id}${output.path}`, `шаг «${step.id}» · ${output.label}`] as const);
    }
  }
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

export function LaunchCard({ id, effect, system, activation, edit }: {
  id: string;
  effect: Effect;
  system: System;
  activation: Activation;
  edit: (change: (draft: Effect) => void) => void;
}) {
  return (
    <>
      {activation === 'triggered' ? (
        <Card>
          <CardHead title="На что отвечает" />
          <div className="row">
            <Field label="Слушаем эффект" needed={!effect.trigger?.on}>
              <Select
                value={effect.trigger?.on ?? ''}
                options={[['', '— выберите —'],
                  ...Object.entries(system.events ?? {})
                    .map(([key, e]) => [`event:${key}`, `событие «${e.label ?? key}»`] as const),
                  ...Object.entries(system.effects)
                    .filter(([key, e]) => key !== id && (e.activation ?? 'manual') !== 'passive')
                    .map(([key, e]) => [key, e.label ?? key] as const)] as never}
                onChange={next => edit(draft => { draft.trigger = { ...draft.trigger, on: next }; })}
              />
            </Field>
            {}
            <Field label="Только если" hint={conditionsOf(system, effect.trigger?.on).length
              ? undefined
              : 'У выбранного эффекта нет именованных шагов с исходом «да/нет» — сработает всегда.'}>
              <Select
                value={String((effect.trigger?.condition as { ref?: string })?.ref ?? '')}
                options={[['', 'всегда'],
                  ...conditionsOf(system, effect.trigger?.on)] as never}
                onChange={next => edit(draft => {
                  draft.trigger = { ...draft.trigger!, condition: next ? { ref: next } : null };
                })}
              />
            </Field>
            {}
            <Field label="Чьё это действие" hint="«Со мной» — я цель чужого действия. «Моё» — я его сделал.">
              <Select
                value={String(effect.trigger?.direction ?? 'in')}
                options={[['in', 'случилось со мной'], ['out', 'сделал я']] as const}
                onChange={next => edit(draft => {
                  draft.trigger = { ...draft.trigger!, direction: next === 'in' ? undefined : 'out' };
                  if (next === 'out' && draft.trigger.to === 'sender') draft.trigger.to = 'self';
                })}
              />
            </Field>
            <Field label="Кому">
              <Select
                value={String(effect.trigger?.to ?? ((effect.trigger?.direction ?? 'in') === 'out' ? 'self' : 'sender'))}
                options={((effect.trigger?.direction ?? 'in') === 'out'
                  ? [['self', 'себе'], ['target', 'цели моего действия']]
                  : [['sender', 'отправителю — ответкой'], ['self', 'себе']]) as never}
                onChange={next => edit(draft => {
                  draft.trigger = { ...draft.trigger!, to: next === 'sender' ? undefined : next as 'self' | 'target' };
                })}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {activation === 'reaction' ? (
        <Card>
          <CardHead title="Когда стол спрашивает" />
          <div className="row">
            <Field label="Момент">
              <Select
                value={String(effect.trigger?.window ?? 'target')}
                options={[
                  ['target', 'на меня действуют — перед тем как это разрешится'],
                  ['sender', 'я бросил — перед тем как результат уйдёт цели'],
                ] as const}
                onChange={next => edit(draft => {
                  draft.trigger = { ...(draft.trigger ?? { on: '*' }), window: next as 'target' | 'sender' };
                })}
              />
            </Field>
            <Field label="На что">
              <Select
                value={effect.trigger?.on ?? '*'}
                options={[['*', 'любое действие'],
                  ...Object.entries(system.effects)
                    .filter(([key, e]) => key !== id && (e.activation ?? 'manual') === 'manual')
                    .map(([key, e]) => [key, e.label ?? key] as const)] as never}
                onChange={next => edit(draft => { draft.trigger = { ...(draft.trigger ?? {}), on: next || '*' }; })}
              />
            </Field>
            <Field label="Только если" hint={(effect.trigger?.on ?? '*') === '*'
              ? 'Исход именованной проверки. Если в действии такого шага нет, реакция не предлагается.'
              : undefined}>
              <Select
                value={String((effect.trigger?.condition as { ref?: string })?.ref ?? '')}
                options={[['', 'всегда'],
                  ...((effect.trigger?.on ?? '*') === '*' ? conditionsOfAny(system) : conditionsOf(system, effect.trigger!.on))] as never}
                onChange={next => edit(draft => {
                  draft.trigger = { ...(draft.trigger ?? { on: '*' }), condition: next ? { ref: next } : null };
                })}
              />
            </Field>
          </div>
          {(effect.trigger?.window ?? 'target') === 'sender' ? (
            <Field label="Перебросить с правкой" hint="Если выбрано — после реакции бросок собирается заново с этими правками из словаря.">
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
      ) : null}
    </>
  );
}
