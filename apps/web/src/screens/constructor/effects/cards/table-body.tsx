import type { System } from '@vtt/schema';
import { rowTables } from '@vtt/engine/model/tables';
import { Field, Select } from '../../../../ui/primitives.tsx';
import { ValueField } from '../../value-field.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { dieEntries } from '../../rules/dice-section.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

export function TableBody({ step, context, edit, system }: { step: Record<string, unknown>; context: SlotContext; edit: EditFn; system: System }) {
  const tables = rowTables(system);
  const by = step.dice !== undefined ? 'dice' : 'value';
  const dice = typeof step.dice === 'string' ? step.dice : '';
  return (
    <div className="row">
      <Field label="Какая таблица" needed={!step.table}>
        <Select<string>
          value={typeof step.table === 'string' ? step.table : ''}
          options={[['', '— какая —'], ...tables.map(([key, table]) => [key, table.label || key] as const)]}
          onChange={next => edit(0, draft => { if (next) loose(draft).table = next; else delete loose(draft).table; })}
        />
      </Field>
      <Field label="По чему ищем строку" hint="Бросок кости — как таблица случайных встреч; число — как дистанция или уровень.">
        <Select<string>
          value={by}
          options={[['value', 'по числу или формуле'], ['dice', 'бросить кость']]}
          onChange={next => edit(0, draft => {
            const d = loose(draft);
            if (next === 'dice') { delete d.value; d.dice = dieEntries(system).find(([, c]) => (c.dice ?? []).length === 1)?.[0] ?? { expr: '"1к6"' }; }
            else { delete d.dice; d.value = d.value ?? { expr: '0' }; }
          })}
        />
      </Field>
      {by === 'dice' ? (
        <Field label="Какой костью">
          <Select<string>
            value={dice}
            options={[['', '— кость —'], ...dieEntries(system).filter(([, c]) => (c.dice ?? []).length === 1).map(([key, c]) => [key, c.label || key] as const)]}
            onChange={next => edit(0, draft => { if (next) loose(draft).dice = next; })}
          />
        </Field>
      ) : (
        <Field label="Число">
          <ValueField
            where="таблица · по чему"
            value={step.value} context={context}
            onChange={next => edit(0, draft => { if (next) loose(draft).value = next; else delete loose(draft).value; })}
          />
        </Field>
      )}
    </div>
  );
}
