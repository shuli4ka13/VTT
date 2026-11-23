import { BoundFormula } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import type { ReactNode } from 'react';
import { Card, CardHead, Field, Button, DangerButton, Fold, Select, LabelInput, TextArea } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import type { System, ValueKind } from '@vtt/schema';
import { TABS } from '../../../words.ts';
import { useT } from '../../../i18n/author.ts';

export const BY_FORMULA = '';

export interface ColumnShape {
  label: string;
  kind: ValueKind | typeof BY_FORMULA;
  from?: string;
  many?: boolean;
  expr?: string;
  hint?: string;
  min?: Bound;
  max?: Bound;
}

export interface ColumnPatch {
  label?: string;
  kind?: ValueKind | typeof BY_FORMULA;
  from?: string | null;
  many?: boolean;
  expr?: string | null;
  hint?: string | null;
  min?: Bound | null;
  max?: Bound | null;
}


export function ColumnCard({ column, kinds, tables, rowsOf, many, formulaHint, where, names, system, onChange, onDelete, onClose, lead, extra, preview, bounds = true, hinted = false, table, sub, noun = 'column', more = false }: {
  more?: boolean;
  hinted?: boolean;
  table?: string;
  column: ColumnShape;
  kinds: readonly (readonly [string, string])[];
  tables: [string, string][];
  rowsOf?: [string, string][];
  many?: boolean;
  formulaHint: string;
  where: string;
  names?: Map<string, string>;
  system: System;
  onChange: (patch: ColumnPatch) => void;
  onDelete: (() => void) | null;
  onClose: () => void;
  lead?: ReactNode;
  bounds?: boolean;
  extra?: ReactNode;
  preview?: ReactNode;
  sub?: ReactNode;
  noun?: 'field' | 'prop' | 'column';
}) {
  const t = useT('tables');
  return (
    <Card>
      <CardHead
        title={<LabelInput value={column.label} placeholder={t(`common:name.${noun}`)} onCommit={label => onChange({ label })} />}
        sub={sub}
        actions={<>
          {onDelete ? <DangerButton size="sm" onConfirm={onDelete}>{t('common:delete')}</DangerButton>
            : <Button size="sm" variant="danger" disabled title={t('column.inUse')}>{t('common:delete')}</Button>}
          <Button size="sm" variant="ghost" title={t('common:collapse')} onClick={onClose}>×</Button>
        </>}
      />
      <div className="row">
        <Field label={t('column.type')}>
          <Select value={column.kind}
            options={(column.expr !== undefined ? [[BY_FORMULA, t('column.byFormula')], ...kinds] : kinds) as never}
            onChange={next => onChange({ kind: next as ValueKind | typeof BY_FORMULA })} />
        </Field>
        {column.kind === 'choice' ? (
          <>
            <Field label={t('column.fromTable')} needed={!column.from}
              error={column.from ? undefined : tables.length
                ? t('column.fromNothing')
                : t('column.noTables', { tab: TABS.rules })}>
              <Select
                value={column.from ?? ''}
                options={[['', t('column.which')], ...tables] as never}
                onChange={next => onChange({ from: next || null })}
              />
            </Field>
            {many ? (
              <Field label={t('column.howMany')}>
                <Select
                  value={column.many ? 'many' : 'one'}
                  options={[['one', t('column.one')], ['many', t('column.several')]] as const}
                  onChange={next => onChange({ many: next === 'many' })}
                />
              </Field>
            ) : null}
          </>
        ) : column.kind === 'number' && rowsOf?.length ? (
          <Field label={t('column.tableRow')}>
            <Select
              value={column.from ?? ''}
              options={[['', t('column.justNumber')], ...rowsOf] as never}
              onChange={next => onChange({ from: next || null })}
            />
          </Field>
        ) : column.kind === 'column' ? (
          <Field label={t('column.columnsOf')}>
            <Select
              value={column.from ?? ''}
              options={[['', t('column.whichTable')], ...tables] as never}
              onChange={next => onChange({ from: next || null })}
            />
          </Field>
        ) : null}
      </div>
      <Field label={formulaHint}>
        <FormulaField
          value={column.expr ?? ''}
          system={system}
          where={where}
          {...(table ? { table } : {})}
          {...(names ? { extraNames: names } : {})}
          placeholder={t('column.formulaPlaceholder')}
          onChange={next => onChange({ expr: next.trim() ? next : null })}
        />
      </Field>
      {preview}
      {lead}
      {(bounds && column.kind === 'number') || extra || hinted ? (
        <Fold title={t('common:more')} summary={t('column.moreSummary')} open={more}>
          {bounds && column.kind === 'number' ? (
            <div className="row">
              <Field label={t('column.min')}>
                <BoundFormula value={column.min} system={system} where={t('column.whereMin', { where })} {...(table ? { table } : {})} {...(names ? { names } : {})} onChange={next => onChange({ min: next })} />
              </Field>
              <Field label={t('column.max')}>
                <BoundFormula value={column.max} system={system} where={t('column.whereMax', { where })} {...(table ? { table } : {})} {...(names ? { names } : {})} onChange={next => onChange({ max: next })} />
              </Field>
            </div>
          ) : null}
          {hinted ? (
            <Field label={t('column.hint')} hint={t('column.hintNote')}>
              <span data-field={t('column.hint')}>
                <TextArea value={column.hint ?? ''} placeholder={t('column.hintPlaceholder')} onChange={next => onChange({ hint: next.trim() ? next : null })} />
              </span>
            </Field>
          ) : null}
          {extra}
        </Fold>
      ) : null}
    </Card>
  );
}
