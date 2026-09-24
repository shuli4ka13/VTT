import { useState } from 'react';
import type { System, SlotRef } from '@vtt/schema';
import { Field, Select, Button } from '../../../../ui/primitives.tsx';
import { SlotInput, type SlotOption } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { calledOf } from '@vtt/engine/engine/effects';
import { Extras } from './extras.tsx';
import { listOf } from '@vtt/engine/model/lists';
import { WhatNext, meddlersOf } from '../what-next.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

function rowsAsOptions(system: System, need: { kind?: string; from?: string }): SlotOption[] | undefined {
  if (need.kind !== 'choice' || !need.from) return undefined;
  const group = `«${system.tables?.[need.from]?.label || need.from}»`;
  return (listOf(system, need.from) ?? []).map(row => ({ group, label: row.label, ref: { const: row.value } as SlotRef }));
}

export function SendBody({ step, at, context, edit, system, onOpenEffect, canAnswer = false }: {
  canAnswer?: boolean;
  step: any;
  at: number;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onOpenEffect?: (id: string) => void;
}) {
  const [peek, setPeek] = useState(false);
  const commons = calledOf(system);
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

      {step.event && canAnswer ? (
        <Field
          label="где выполнить"
          hint={step.to === 'sender'
            ? 'Получатель отвечает отправителю: вызванный эффект выполнится на листе отправителя. Так «Вампирское касание» лечит атакующего.'
            : undefined}
        >
          <Select
            value={step.to === 'sender' ? 'sender' : 'here'}
            options={[['here', 'у получателя — здесь же'], ['sender', 'у отправителя — ответом']] as const}
            onChange={next => edit(at, draft => { if (next === 'sender') loose(draft).to = 'sender'; else delete loose(draft).to; })}
          />
        </Field>
      ) : null}

      {step.event ? (
        <div className="stack stack--tight call-args">
          <div className="call-args__head">
            <span className="field__label">Что отправляем в «{called?.label || String(step.event)}» — его «Что приходит»</span>
            <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
              {`что будет дальше${meddlersOf(system, String(step.event)).length ? ' · цель может урезать' : ''} →`}
            </Button>
          </div>

          {asks.length ? null : <span className="faint">«{called?.label || String(step.event)}» ничего не принимает.</span>}

          {asks.map(need => (
            <div className="pair" key={need.key}>
              <span className="call-args__name">{need.label ?? need.key}</span>
              <SlotInput
                where={`вызов · ${need.label ?? need.key}`}
                value={args[need.key] as never} context={context}
                keep={need.kind === 'number' ? ['param'] : ['const', 'param']}
                extraOptions={rowsAsOptions(system, need)}
                onChange={next => edit(at, draft => {
                  const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
                  if (next === undefined || next === null) delete all[need.key]; else all[need.key] = next;
                  if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
                })}
              />
              <span className={args[need.key] === undefined && !need.optional && !need.ask ? 'need' : 'faint'}>
                {args[need.key] !== undefined ? ''
                  : need.ask ? (need.ask.by === 'gm' ? 'спросят ведущего' : 'спросят игрока')
                    : need.optional ? 'можно не заполнять' : 'не заполнено'}
              </span>
            </div>
          ))}

        </div>
      ) : null}

      <WhatNext
        open={peek}
        onClose={() => setPeek(false)}
        system={system}
        eventId={String(step.event ?? '')}
        onEdit={id => onOpenEffect?.(id)}
      />

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
