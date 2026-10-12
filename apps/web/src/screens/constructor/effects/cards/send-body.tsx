import { useState } from 'react';
import type { System } from '@vtt/schema';
import { Button } from '../../../../ui/primitives.tsx';
import { CallEditor } from '../../call-editor.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { callable } from '../../slots.tsx';
import { implicitOf } from '@vtt/engine/model/implicit';
import type { Param, Effect } from '@vtt/schema';

function implicitWords(param: Param, caller: Effect, inLoop: boolean): string | null {
  const how = implicitOf(param, caller);
  if (!how || (how.by === 'target' && !inLoop)) return null;
  const own = (caller.params ?? []).find(p => p.key === how.from);
  if (how.by === 'target') {
    const list = (caller.params ?? []).find(p => p.item?.key === how.from);
    return `сам: ${String(list?.item?.label ?? how.from).toLowerCase()}`;
  }
  return `сам: «${String(own?.label ?? how.from)}»`;
}
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
  const id = typeof step.effect === 'string' ? step.effect : '';
  return (
    <>
      <CallEditor
        system={system}
        effect={step.effect ?? ''}
        effects={commons}
        inputs={context.effect.params ?? []}
        onEffect={next => edit(at, draft => { if (next) loose(draft).effect = next; else delete loose(draft).effect; })}
        args={args}
        context={context}
        where="вызов"
        implicit={param => implicitWords(param, context.effect, context.earlier.some(s => s.type === 'each'))}
        onArg={(key, next) => edit(at, draft => {
          const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
          if (next === undefined || next === null) delete all[key]; else all[key] = next;
          if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
        })}
        headAction={(
          <>
          {id && onOpenEffect ? <Button size="sm" variant="ghost" onClick={() => onOpenEffect(id)}>как устроено →</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
            {`что будет дальше${meddlersOf(system, id).length ? ' · кто может изменить' : ''} →`}
          </Button>
          </>
        )}
      >
        {null}
      </CallEditor>

      <WhatNext
        open={peek}
        onClose={() => setPeek(false)}
        system={system}
        eventId={id}
        onEdit={id => onOpenEffect?.(id)}
      />
    </>
  );
}
