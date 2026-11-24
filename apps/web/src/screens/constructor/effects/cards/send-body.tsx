import { useState } from 'react';
import type { System } from '@vtt/schema';
import { Button, Field, Fold } from '../../../../ui/primitives.tsx';
import { TagsField } from '../../tags-field.tsx';
import { CallEditor } from '../../call-editor.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { callable } from '../../slots.tsx';
import { callArgs } from '../call-args.ts';
import { WhatNext, meddlersOf } from '../what-next.tsx';
import { useT } from '../../../../i18n/author.ts';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function SendBody({ step, at, context, edit, system, onOpenEffect }: {
  step: any;
  at: number;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onOpenEffect?: (id: string) => void;
}) {
  const t = useT('stepCards');
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
        onEffect={next => edit(at, draft => {
          const d = loose(draft);
          if (!next) { delete d.effect; return; }
          d.effect = next;
          if (typeof next !== 'string') return;
          const args = callArgs(system, context.effect, next, d.args as Record<string, unknown> | undefined, { inLoop: context.earlier.some(s => s.splits) });
          if (Object.keys(args).length) d.args = args; else delete d.args;
        })}
        args={args}
        context={context}
        where={t('send.where')}
        onArg={(key, next) => edit(at, draft => {
          const all = { ...((loose(draft).args ?? {}) as Record<string, unknown>) };
          if (next === undefined || next === null) delete all[key]; else all[key] = next;
          if (Object.keys(all).length) loose(draft).args = all; else delete loose(draft).args;
        })}
        headAction={(
          <>
          {id && onOpenEffect ? <Button size="sm" variant="ghost" onClick={() => onOpenEffect(id)}>{t('send.open')}</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
            {meddlersOf(system, id).length ? t('send.nextMeddlers') : t('send.next')}
          </Button>
          </>
        )}
      >
        {null}
      </CallEditor>

      <Fold title={t('common:more')} summary={t('send.moreSummary')} open={Array.isArray(step.tags) && step.tags.length > 0}>
        <Field label={t('send.tags')} hint={t('send.tagsHint')}>
          <TagsField
            system={system}
            value={step.tags}
            computed
            empty={t('send.tagsEmpty')}
            {...(context.names ? { names: context.names } : {})}
            onChange={next => edit(at, draft => { if (next.length) loose(draft).tags = next; else delete loose(draft).tags; })}
          />
        </Field>
      </Fold>

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
