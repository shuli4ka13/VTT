import type { System } from '@vtt/schema';
import { rowTables } from '@vtt/engine/model/tables';
import { useState } from 'react';
import { Field, Select, Input } from '../../../../ui/primitives.tsx';
import { normalizeDice } from '../../value-field.tsx';
import { unquote } from '../../roll-expr.ts';
import { asDice, dice } from '../../../../words.ts';
import { ValueField } from '../../value-field.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { dieEntries } from '../../rules/dice-section.tsx';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

const OWN_DIE = ':своя';

export function TableBody({ step, context, edit, system }: { step: Record<string, unknown>; context: SlotContext; edit: EditFn; system: System }) {
  const tables = rowTables(system);
  const by = step.dice !== undefined ? 'dice' : 'value';
  const picked = typeof step.dice === 'string' ? step.dice : '';
  const own = Boolean(step.dice && typeof step.dice === 'object');
  const ownText = own ? asDice(unquote(String((step.dice as { expr?: unknown }).expr ?? ''))) : '';
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
      <Field label="Какая колонка" hint="Что брать из найденной строки. Пусто — колонку «значение».">
        <Select<string>
          value={typeof step.column === 'string' ? step.column : ''}
          options={[['', '— значение —'], ...(((typeof step.table === 'string' ? system.tables?.[step.table]?.columns : undefined) ?? [])
            .filter(column => column.key !== 'value')
            .map(column => [column.key, column.label || column.key] as const))]}
          onChange={next => edit(0, draft => { if (next) loose(draft).column = next; else delete loose(draft).column; })}
        />
      </Field>
      {by === 'dice' ? (
        <Field label="Какой костью">
          <div className="inline inline--tight">
            <Select<string>
              value={own ? OWN_DIE : picked}
              options={[['', '— кость —'], ...dieEntries(system).filter(([, c]) => (c.dice ?? []).length === 1).map(([key, c]) => [key, c.label || key] as const), [OWN_DIE, 'своя кость…']]}
              onChange={next => edit(0, draft => {
                if (next === OWN_DIE) loose(draft).dice = { expr: JSON.stringify(dice(1, 6)) };
                else if (next) loose(draft).dice = next;
              })}
            />
            {own ? (
              <DiceText value={ownText} onCommit={notation => edit(0, draft => { loose(draft).dice = { expr: JSON.stringify(notation) }; })} />
            ) : null}
          </div>
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

function DiceText({ value, onCommit }: { value: string; onCommit: (notation: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const notation = draft === null ? null : normalizeDice(draft);
    if (notation) onCommit(notation);
    setDraft(null);
  };
  return (
    <Input mono value={draft ?? value} placeholder="1к10" invalid={draft !== null && !normalizeDice(draft)}
      onChange={setDraft} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
