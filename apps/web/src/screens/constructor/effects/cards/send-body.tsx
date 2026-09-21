import type { System } from '@vtt/schema';
import { Field, Select } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { calledOf } from '@vtt/engine/engine/effects';
import { Extras } from './extras.tsx';
import { TagPick, type Tag } from '../../tag-pick.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function SendBody({ step, at, context, edit, system }: {
  step: any;
  at: number;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const commons = calledOf(system);
  const all: unknown[] = Array.isArray(step.tags) ? step.tags : [];
  const called = system.effects?.[String(step.event ?? '')];
  const asks = called?.params ?? [];
  const args = (step.args ?? {}) as Record<string, unknown>;
  return (
    <>
    <div className="row">
      <Field label="какой эффект вызываем" needed={!step.event}
        hint={commons.length ? undefined : 'Вызываемых эффектов пока нет — заведите кнопкой «+ вызываемый» слева.'}>
        <Select
          value={String(step.event ?? '')}
          options={[['', '— какой эффект зовём —'],
            ...commons.map(([id, e]) => [id, e.label || id] as const)] as never}
          onChange={next => edit(at, draft => { loose(draft).event = next; })}
        />
      </Field>
      <Field label="сколько">
        <SlotInput
          value={step.amount} context={context} allow={['ref', 'expr', 'const', 'param']}
          onChange={next => edit(at, draft => { loose(draft).amount = next ?? undefined; })}
        />
      </Field>
    </div>

    {asks.length ? (
      <div className="row">
        {asks.map(need => (
          <Field key={need.key} label={`${need.label ?? need.key} — для «${called?.label ?? step.event}»`} needed={args[need.key] === undefined}>
            <SlotInput
              value={args[need.key] as never} context={context}
              onChange={next => edit(at, draft => {
                const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
                if (next === undefined || next === null) delete all[need.key]; else all[need.key] = next;
                if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
              })}
            />
          </Field>
        ))}
      </div>
    ) : null}

    <Extras
      items={[
        {
          key: 'tags', label: 'метки', on: all.length > 0,
          add: () => edit(at, draft => { loose(draft).tags = []; }),
          drop: () => edit(at, draft => { delete loose(draft).tags; }),
          node: (
      <Field label="Метки" hint="Чем помечена посылка. Цель по ним решает, что с ней делать.">
        <TagPick
          value={all as Tag[]}
          known={[...new Set(Object.values(system.effects).flatMap(e => e.tags ?? []))]}
          fromRecord={(context.effect.params ?? []).map(p => ({ key: p.key, label: p.label ?? p.key }))}
          onChange={next => edit(at, draft => {
            if (next.length) loose(draft).tags = next; else delete loose(draft).tags;
          })}
        />
      </Field>
          ),
        },
        {
          key: 'strict', label: 'обрывать всё, если вызванный оборвался', on: !!step.strict,
          add: () => edit(at, draft => { loose(draft).strict = true; }),
          drop: () => edit(at, draft => { delete loose(draft).strict; }),
          node: (
            <Field label="если вызванный оборвался" hint="«Оборваться тоже» — для платы: нет ячейки, значит и заклинания нет.">
              <Select
                value={step.strict ? 'true' : 'false'}
                options={[['false', 'идти дальше'], ['true', 'оборваться тоже']] as const}
                onChange={next => edit(at, draft => {
                  if (next === 'true') loose(draft).strict = true; else delete loose(draft).strict;
                })}
              />
            </Field>
          ),
        },
      ]}
    />
    </>
  );
}
