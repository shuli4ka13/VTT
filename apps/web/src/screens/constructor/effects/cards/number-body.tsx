import type { Step } from '@vtt/schema';
import { Field, Input, Button, Select } from '../../../../ui/primitives.tsx';
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
  onAddParam?: (label: string, kind: string) => string;
}) {
  const read = loose(step);
  const source = typeof read.source === 'object' ? 'roll' : (read.source ?? 'roll');
  const written = textOf(read);
  const words = written ? formulaAsLabels(context.system, written, namesOf(context)) : '';
  const oldWay = asOneFormula(step);

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

  if (oldWay) {
    return (
      <div className="stack stack--tight">
        <div className="row">
          <Field label="кости">
            <SlotInput
              value={slotOf(read, 'dice')} context={context} dice placeholder="кости или из записи"
              onChange={next => edit(0, draft => { loose(draft).dice = next ?? undefined; })}
              onCreateFromRecord={onAddParam ? () => ({ param: onAddParam('кости', 'dice') }) : undefined}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={slotOf(read, 'bonus')} context={context}
              onChange={next => edit(0, draft => { loose(draft).bonus = next ?? undefined; })}
            />
          </Field>
          <Field label="сколько раз кинуть">
            <SlotInput
              value={slotOf(read, 'count')} context={context} allow={['expr', 'const', 'param', 'tag', 'table', 'ref']}
              onChange={next => edit(0, draft => {
                if (next === null || next === undefined) delete loose(draft).count;
                else loose(draft).count = next;
              })}
            />
          </Field>
        </div>

        <span className="faint">Это старая запись, из трёх полей. Одной строкой она читается так:</span>
        <span className="faint mono">{oldWay}</span>
        <Button size="sm" variant="ghost" onClick={() => edit(0, draft => {
          const target = loose(draft);
          delete target.dice;
          delete target.bonus;
          delete target.count;
          target.source = 'item';
          target.fixed = { expr: oldWay };
        })}>переписать одной строкой</Button>
      </div>
    );
  }

  return (
    <>
      <Field
        label="Сколько"
        hint="Обычная математика. Кость бросается так: кинуть(@кость_урона) — вторым числом сколько раз."
        needed={!written}
      >
        <Input
          value={written}
          mono
          placeholder="кинуть(@кость_урона) + @прибавка"
          onChange={next => edit(0, draft => {
            const target = loose(draft);
            target.source = 'item';
            if (next.trim()) target.fixed = { expr: next };
            else delete target.fixed;
          })}
        />
      </Field>

      {words && words !== written ? <span className="faint">{words}</span> : null}

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
