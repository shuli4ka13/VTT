import type { Step } from '@vtt/schema';
import { STEP_WORDS, slotShown } from '@vtt/engine';
import { Field, Select } from '../../../../ui/primitives.tsx';
import { ValueField } from '../../value-field.tsx';
import { AddendPick } from './die-pick.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { useT } from '../../../../i18n/author.ts';

type Loose = Record<string, unknown>;
type Slot = { key: string; label: string; kind: string; allow?: string[]; choice?: [string, string][]; fallback?: string; placeholder?: string; dice?: boolean; onlyIf?: { key: string; is: string }; seed?: unknown };

export function SeenBody({ step, context, edit }: { step: Step; context: SlotContext; edit: EditFn }) {
  const t = useT('rollCards');
  const words = STEP_WORDS[step.type as keyof typeof STEP_WORDS];
  const read = step as unknown as Loose;
  const all = (words?.slots ?? []) as unknown as Slot[];
  if (step.type === 'roll-plus') {
    return (
      <div className="row">
        <Field label={t('count')}>
          <AddendPick source={read} system={context.system} effect={context.effect} context={context} where={t('plusWhere')}
            onChange={change => edit(0, draft => change(draft as unknown as Loose))} />
        </Field>
      </div>
    );
  }
  return (
    <div className="row">
      {all.filter(slot => slotShown(slot, read, all as never)).map(slot => {
        if (slot.kind === 'choice' || slot.kind === 'flag') {
          return (
            <Field key={slot.key} label={slot.label}>
              <Select
                value={String(read[slot.key] ?? slot.fallback ?? '')}
                options={(slot.choice ?? []) as never}
                onChange={next => edit(0, draft => {
                  const it = draft as unknown as Loose;
                  if (next === String(it[slot.key] ?? slot.fallback ?? '')) return;
                  if (next && next !== slot.fallback) it[slot.key] = slot.kind === 'flag' ? next === 'true' : next;
                  else delete it[slot.key];
                  for (const other of all) {
                    if (other.onlyIf?.key !== slot.key) continue;
                    if (!slotShown(other, it, all as never)) delete it[other.key];
                    else if (it[other.key] === undefined && other.seed !== undefined) it[other.key] = structuredClone(other.seed);
                  }
                })}
              />
            </Field>
          );
        }
        return (
          <Field key={slot.key} label={slot.label}>
            <ValueField
              where={t('slotWhere', { step: words?.label ?? step.type, slot: slot.label.toLowerCase() })}
              value={read[slot.key] as never} context={context}
              {...(slot.placeholder ? { placeholder: slot.placeholder } : {})}
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
