import { useState } from 'react';
import type { System } from '@vtt/schema';
import { Field, Select, Button } from '../../../../ui/primitives.tsx';
import { CallEditor } from '../../call-editor.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { calledOf } from '@vtt/engine/engine/effects';
import { Extras } from './extras.tsx';
import { WhatNext, meddlersOf } from '../what-next.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

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
  const args = (step.args ?? {}) as Record<string, unknown>;
  return (
    <>
      <CallEditor
        system={system}
        effect={String(step.event ?? '')}
        effects={commons}
        onEffect={next => edit(at, draft => { loose(draft).event = next; })}
        args={args}
        context={context}
        where="вызов"
        onArg={(key, next) => edit(at, draft => {
          const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
          if (next === undefined || next === null) delete all[key]; else all[key] = next;
          if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
        })}
        headAction={(
          <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
            {`что будет дальше${meddlersOf(system, String(step.event)).length ? ' · цель может урезать' : ''} →`}
          </Button>
        )}
      >
        {step.event && canAnswer ? (
          <Field
            label="Где выполнить"
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
      </CallEditor>

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
