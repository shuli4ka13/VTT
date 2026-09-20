import type { System } from '@vtt/schema';
import { Field, Select, Input } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

export function SendBody({ step, at, context, edit, system }: {
  step: any;
  at: number;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const commons = Object.entries(system.events ?? {});
  const tags: string[] = Array.isArray(step.tags) ? step.tags.filter((t: unknown) => typeof t === 'string') : [];
  return (
    <div className="row">
      <Field label="какой эффект вызываем" needed={!step.event}
        hint={commons.length ? undefined : 'Общих эффектов пока нет — заведите кнопкой «+ общий» слева.'}>
        <Select
          value={String(step.event ?? '')}
          options={[['', '— какой общий эффект —'],
            ...commons.map(([id, e]) => [id, e.label || id] as const)] as never}
          onChange={next => edit(at, draft => { (draft as any).event = next; })}
        />
      </Field>
      <Field label="сколько">
        <SlotInput
          value={step.amount} context={context} allow={['ref', 'expr', 'const', 'param']}
          onChange={next => edit(at, draft => { (draft as any).amount = next ?? undefined; })}
        />
      </Field>
      <Field label="теги" hint="Через запятую: огонь, магический. По ним цель узнаёт своё сопротивление.">
        <Input
          value={tags.join(', ')}
          onChange={text => edit(at, draft => {
            (draft as any).tags = text.split(',').map(s => s.trim()).filter(Boolean);
          })}
        />
      </Field>
    </div>
  );
}
