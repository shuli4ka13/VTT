import type { System } from '@vtt/schema';
import { rowTables } from '@vtt/engine';
import { useState } from 'react';
import { Field, Select, Input } from '../../../../ui/primitives.tsx';
import { normalizeDice } from '../../value-field.tsx';
import { unquote } from '../../roll-expr.ts';
import { asDice, dice } from '../../../../words.ts';
import { ValueField } from '../../value-field.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { dieEntries } from '../../rules/dice-section.tsx';
import { useT } from '../../../../i18n/author.ts';

const loose = (draft: unknown): Record<string, unknown> => draft as Record<string, unknown>;

const OWN_DIE = 'own-die';

export function TableBody({ step, context, edit, system }: { step: Record<string, unknown>; context: SlotContext; edit: EditFn; system: System }) {
  const t = useT('stepCards');
  const tables = rowTables(system);
  const by = step.dice !== undefined ? 'dice' : 'value';
  const picked = typeof step.dice === 'string' ? step.dice : '';
  const own = Boolean(step.dice && typeof step.dice === 'object');
  const ownText = own ? asDice(unquote(String((step.dice as { expr?: unknown }).expr ?? ''))) : '';
  return (
    <div className="row">
      <Field label={t('table.which.label')} needed={!step.table}>
        <Select<string>
          value={typeof step.table === 'string' ? step.table : ''}
          options={[['', t('table.which.blank')], ...tables.map(([key, table]) => [key, table.label || key] as const)]}
          onChange={next => edit(0, draft => { if (next) loose(draft).table = next; else delete loose(draft).table; })}
        />
      </Field>
      <Field label={t('table.by.label')} hint={t('table.by.hint')}>
        <Select<string>
          value={by}
          options={[['value', t('table.by.value')], ['dice', t('table.by.dice')]]}
          onChange={next => edit(0, draft => {
            const d = loose(draft);
            if (next === 'dice') { delete d.value; d.dice = dieEntries(system).find(([, c]) => (c.dice ?? []).length === 1)?.[0] ?? { expr: '"1d6"' }; }
            else { delete d.dice; d.value = d.value ?? { expr: '0' }; }
          })}
        />
      </Field>
      <Field label={t('table.column.label')} hint={t('table.column.hint')}>
        <Select<string>
          value={typeof step.column === 'string' ? step.column : ''}
          options={[['', t('table.column.blank')], ...(((typeof step.table === 'string' ? system.tables?.[step.table]?.columns : undefined) ?? [])
            .filter(column => column.key !== 'value')
            .map(column => [column.key, column.label || column.key] as const))]}
          onChange={next => edit(0, draft => { if (next) loose(draft).column = next; else delete loose(draft).column; })}
        />
      </Field>
      {by === 'dice' ? (
        <Field label={t('table.die.label')}>
          <div className="inline inline--tight">
            <Select<string>
              value={own ? OWN_DIE : picked}
              options={[['', t('table.die.blank')], ...dieEntries(system).filter(([, c]) => (c.dice ?? []).length === 1).map(([key, c]) => [key, c.label || key] as const), [OWN_DIE, t('table.die.own')]]}
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
        <Field label={t('table.number.label')}>
          <ValueField
            where={t('table.number.where')}
            value={step.value} context={context}
            onChange={next => edit(0, draft => { if (next) loose(draft).value = next; else delete loose(draft).value; })}
          />
        </Field>
      )}
    </div>
  );
}

function DiceText({ value, onCommit }: { value: string; onCommit: (notation: string) => void }) {
  const t = useT('stepCards');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const notation = draft === null ? null : normalizeDice(draft);
    if (notation) onCommit(notation);
    setDraft(null);
  };
  return (
    <Input mono value={draft ?? value} placeholder={t('table.dicePlaceholder')} invalid={draft !== null && !normalizeDice(draft)}
      onChange={setDraft} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
