import type { Step } from '@vtt/schema';
import { Field, Input, Select, Button } from '../../../../ui/primitives.tsx';
import { formulaAsLabels } from '../../../../ui/formula.tsx';
import { SlotInput } from '../../slot-input.tsx';
import { asOneFormula } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const slotOf = (step: Loose, key: string) => step[key] as never;

const textOf = (step: Loose): string => {
  const fixed = step.fixed as { expr?: unknown } | undefined;
  return typeof fixed?.expr === 'string' ? fixed.expr : '';
};

export function NumberBody({ step, context, edit, onAddParam }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string, want?: string) => string;
}) {
  const read = loose(step);
  const source = typeof read.source === 'object' ? 'roll' : (read.source ?? 'roll');
  const line = textOf(read) || asOneFormula(step) || '';
  const names = namesOf(context);
  const words = line ? formulaAsLabels(context.system, line, names) : '';

  const unknown = [...new Set([...line.matchAll(/@([\p{L}\p{N}_]+)/gu)].map(m => m[1]!))]
    .filter(name => !names.has(name) && !context.system.fields.some(f => f.tag === name));

  if (source === 'margin') {
    return (
      <Field label="какое превышение">
        <SlotInput
          value={slotOf(read, 'margin')} context={context} allow={['ref']}
          onChange={next => edit(0, draft => { loose(draft).margin = next ?? undefined; })}
        />
      </Field>
    );
  }

  return (
    <>
      <Field
        label="Сколько"
        hint="Обычная математика. Кость бросается так: кинуть(@кость_урона) — вторым числом сколько раз."
        needed={!line}
      >
        <Input
          value={line}
          mono
          placeholder="кинуть(@кость_урона) + @прибавка"
          onChange={next => edit(0, draft => {
            const target = loose(draft);
            delete target.dice;
            delete target.bonus;
            delete target.count;
            delete target.double;
            target.source = 'item';
            if (next.trim()) target.fixed = { expr: next };
            else delete target.fixed;
          })}
        />
      </Field>

      {words && words !== line ? <span className="faint">{words}</span> : null}

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, name, name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      {source !== 'item' ? (
        <Field label="откуда">
          <Select
            value={String(source)}
            options={[['item', 'формулой'], ['margin', 'превышение проверки']] as const}
            onChange={next => edit(0, draft => { loose(draft).source = next; })}
          />
        </Field>
      ) : null}
    </>
  );
}
