import { useState } from 'react';
import type { System } from '@vtt/schema';
import { Button } from '../../../../ui/primitives.tsx';
import { CallEditor } from '../../call-editor.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { callable } from '../../slots.tsx';
import { WhatNext, meddlersOf } from '../what-next.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function SendBody({ step, at, context, edit, system, onOpenEffect }: {
  step: any;
  at: number;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onOpenEffect?: (id: string) => void;
}) {
  const [peek, setPeek] = useState(false);
  const commons = callable(system, context.effect);
  const args = (step.args ?? {}) as Record<string, unknown>;
  return (
    <>
      <CallEditor
        system={system}
        effect={String(step.effect ?? '')}
        effects={commons}
        onEffect={next => edit(at, draft => { loose(draft).effect = next; })}
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
            {`что будет дальше${meddlersOf(system, String(step.effect)).length ? ' · правки могут урезать' : ''} →`}
          </Button>
        )}
      >
        {null}
      </CallEditor>

      <WhatNext
        open={peek}
        onClose={() => setPeek(false)}
        system={system}
        eventId={String(step.effect ?? '')}
        onEdit={id => onOpenEffect?.(id)}
      />
    </>
  );
}
