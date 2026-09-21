import type { System } from '@vtt/schema';
import { Field, Select, Input, Chip } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { calledOf } from '@vtt/engine/engine/effects';
import { Extras } from './extras.tsx';

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
  const tags: string[] = all.filter((t): t is string => typeof t === 'string');
  const fromRecord = all.filter((t): t is { param: string } => Boolean(t) && typeof t === 'object' && 'param' in (t as object));
  const needs = (context.effect.params ?? []).filter(p => !fromRecord.some(t => t.param === p.key));
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

    <Extras
      items={[
        {
          key: 'tags', label: 'метки', on: all.length > 0,
          add: () => edit(at, draft => { loose(draft).tags = []; }),
          drop: () => edit(at, draft => { delete loose(draft).tags; }),
          node: (
      <Field label="метки" hint="Через запятую: огонь, магический. По ним цель узнаёт своё сопротивление.">
        <Input
          value={tags.join(', ')}
          onChange={text => edit(at, draft => {
            loose(draft).tags = [...fromRecord, ...text.split(',').map(s => s.trim()).filter(Boolean)];
          })}
        />
        <div className="inline inline--tight">
          {fromRecord.map(tag => (
            <Chip
              key={tag.param}
              active
              onRemove={() => edit(at, draft => {
                loose(draft).tags = all.filter(t => t !== tag);
              })}
            >
              {context.effect.params?.find(p => p.key === tag.param)?.label ?? tag.param} — из записи
            </Chip>
          ))}
          {needs.length ? (
            <Select
              value=""
              options={[['', '+ тег из записи…'], ...needs.map(p => [p.key, p.label ?? p.key] as const)] as never}
              onChange={next => { if (next) edit(at, draft => { loose(draft).tags = [...all, { param: next }]; }); }}
            />
          ) : null}
        </div>
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
