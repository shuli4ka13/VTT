import { Field, Select, Input } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import { outputRefs } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function NumberBody({ step, context, edit, onAddParam, earlier }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string) => string;
  earlier: EarlierStep[];
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
          <Field label="сколько раз кинуть" hint="Пусто — один раз. Формула или поле: «половина уровня» для скрытой атаки, «круг − 3» для усиленного заклинания.">
            <SlotInput
              value={step.count} context={context} allow={['expr', 'const', 'param', 'tag']}
              onChange={next => edit(0, draft => {
                if (next === null || next === undefined) delete loose(draft).count;
                else loose(draft).count = next;
              })}
            />
          </Field>
          <DoubleField step={step} earlier={earlier} edit={edit} />
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

function DoubleField({ step, earlier, edit }: {
  step: any;
  earlier: EarlierStep[];
  edit: EditFn;
}) {
  const numbers = outputRefs(earlier).filter(output => output.kind === 'number');
  const double = step.double as { ref?: string; atLeast?: number } | undefined;
  if (!numbers.length && !double?.ref) return null;

  return (
    <div className="row">
      <Field
        label="удвоить кости, если"
        hint="Крит: кости кидаются вдвое. Смотрит на бросок выше по цепочке — например «выпало на костях»."
      >
        <Select
          value={double?.ref ?? ''}
          options={[['', 'никогда'], ...numbers.map(output => [output.ref, output.label] as const)] as never}
          onChange={next => edit(0, draft => {
            const target = loose(draft);
            if (!next) { delete target.double; return; }
            target.double = { ref: next, atLeast: double?.atLeast ?? 20 };
          })}
        />
      </Field>
      {double?.ref ? (
        <Field label="не меньше">
          <Input
            type="number"
            value={double.atLeast ?? 20}
            onChange={next => edit(0, draft => {
              loose(draft).double = { ref: double.ref, atLeast: Number(next) || 0 };
            })}
          />
        </Field>
      ) : null}
    </div>
  );
}
