import type { System } from '@vtt/schema';
import { Field, Select } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { calledOf } from '@vtt/engine/engine/effects';
import { Extras } from './extras.tsx';
import { TagPick, type Tag } from '../../tag-pick.tsx';
import { tagsOf } from '@vtt/engine/model/lists';

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
      <Field
        label="Зовём эффект" needed={!step.event}
        hint={commons.length ? undefined : 'Вызываемых эффектов пока нет — заведите кнопкой «+ вызываемый» слева.'}
      >
        <Select
          value={String(step.event ?? '')}
          options={[['', '— какой эффект зовём —'],
            ...commons.map(([id, e]) => [id, e.label || id] as const)] as never}
          onChange={next => edit(at, draft => { loose(draft).event = next; })}
        />
      </Field>

      {step.event ? (
        <div className="stack stack--tight call-args">
          <span className="field__label">
            Что ему отправляем
          </span>

          <div className="pair">
            <span className="call-args__name">число</span>
            <SlotInput
              value={step.amount} context={context} allow={['ref', 'expr', 'const', 'param']}
              onChange={next => edit(at, draft => { loose(draft).amount = next ?? undefined; })}
            />
            <span />
          </div>

          {asks.map(need => (
            <div className="pair" key={need.key}>
              <span className="call-args__name">{need.label ?? need.key}</span>
              <SlotInput
                value={args[need.key] as never} context={context}
                onChange={next => edit(at, draft => {
                  const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
                  if (next === undefined || next === null) delete all[need.key]; else all[need.key] = next;
                  if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
                })}
              />
              <span className={args[need.key] === undefined ? 'need' : undefined}>
                {args[need.key] === undefined ? 'не заполнено' : ''}
              </span>
            </div>
          ))}

          <div className="pair">
            <span className="call-args__name">метки</span>
            <TagPick
              value={all as Tag[]}
              known={called ? tagsOf(system, called) : []}
              fromRecord={(context.effect.params ?? []).map(p => ({ key: p.key, label: p.label ?? p.key }))}
              onChange={next => edit(at, draft => {
                if (next.length) loose(draft).tags = next; else delete loose(draft).tags;
              })}
            />
            <span />
          </div>
        </div>
      ) : null}

      <Extras
        items={[
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
