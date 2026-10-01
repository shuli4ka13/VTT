import type { Step } from '@vtt/schema';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import { Field, Select } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

type Loose = Record<string, unknown>;
type Slot = { key: string; label: string; kind: string; allow?: string[]; choice?: [string, string][]; fallback?: string };

export function SeenBody({ step, context, edit }: { step: Step; context: SlotContext; edit: EditFn }) {
  const words = STEP_WORDS[step.type as keyof typeof STEP_WORDS];
  const read = step as unknown as Loose;
  return (
    <div className="row">
      {(words?.slots ?? []).map(raw => {
        const slot = raw as unknown as Slot;
        if (slot.kind === 'choice' || slot.kind === 'flag') {
          return (
            <Field key={slot.key} label={slot.label}>
              <Select
                value={String(read[slot.key] ?? slot.fallback ?? '')}
                options={(slot.choice ?? []) as never}
                onChange={next => edit(0, draft => {
                  const it = draft as unknown as Loose;
                  if (next && next !== slot.fallback) it[slot.key] = slot.kind === 'flag' ? next === 'true' : next;
                  else delete it[slot.key];
                })}
              />
            </Field>
          );
        }
        return (
          <Field key={slot.key} label={slot.label}>
            <SlotInput
              where={`${words?.label ?? step.type} · ${slot.label.toLowerCase()}`}
              value={read[slot.key] as never} context={context} allow={slot.allow as never}
              onChange={next => edit(0, draft => {
                const it = draft as unknown as Loose;
                if (next === null || next === undefined) delete it[slot.key]; else it[slot.key] = next;
              })}
            />
          </Field>
        );
      })}
    </div>
  );
}
