import { Field, Select } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function NumberBody({ step, context, edit, onAddParam }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const source = typeof step.source === 'object' ? 'roll' : (step.source ?? 'roll');
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  return (
    <>
      <Field label="откуда">
        <Select
          value={String(source)}
          options={[
            ['roll', 'свой бросок'], ['margin', 'превышение проверки'], ['item', 'фикс записи'],
          ] as const}
          onChange={next => edit(0, draft => { loose(draft).source = next; })}
        />
      </Field>

      {source === 'roll' ? (
        <>
          <Field label="кости">
            <SlotInput
              value={step.dice} context={context} dice placeholder="кости или из записи"
              onChange={next => edit(0, draft => { loose(draft).dice = next ?? undefined; })}
              onCreateFromRecord={fromRecord('кости', 'dice')}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={step.bonus} context={context}
              onChange={next => edit(0, draft => { loose(draft).bonus = next ?? undefined; })}
            />
          </Field>
          <Field
            label="сколько раз кинуть"
            hint="Пусто — один раз. Можно формулой по броску выше: «выпало не меньше порога крита → две»."
          >
            <SlotInput
              value={step.count} context={context} allow={['expr', 'const', 'param', 'tag', 'table', 'ref']}
              onChange={next => edit(0, draft => {
                if (next === null || next === undefined) delete loose(draft).count;
                else loose(draft).count = next;
              })}
            />
          </Field>

        </>
      ) : null}

      {source === 'margin' ? (
        <Field label="какое превышение">
          <SlotInput
            value={step.margin} context={context} allow={['ref']}
            onChange={next => edit(0, draft => { loose(draft).margin = next ?? undefined; })}
          />
        </Field>
      ) : null}

      {source === 'item' ? (
        <Field label="фикс записи">
          <SlotInput
            value={step.fixed} context={context}
            onChange={next => edit(0, draft => { loose(draft).fixed = next ?? undefined; })}
            onCreateFromRecord={fromRecord('фикс записи', 'expr')}
          />
        </Field>
      ) : null}
    </>
  );
}
