import { BoundFormula } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import type { ReactNode } from 'react';
import { Card, CardHead, Field, Button, DangerButton, Fold, Select, LabelInput, TextArea } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import type { System, ValueKind } from '@vtt/schema';
import { TABS } from '../../../words.ts';

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


export function ColumnCard({ column, kinds, tables, rowsOf, many, formulaHint, where, names, system, onChange, onDelete, onClose, lead, extra, preview, bounds = true, hinted = false, table, sub, noun = 'колонка', more = false }: {
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
  noun?: string;
}) {
  return (
    <Card>
      <CardHead
        title={<LabelInput value={column.label} placeholder={`как зовётся ${noun}`} onCommit={label => onChange({ label })} />}
        sub={sub}
        actions={<>
          {onDelete ? <DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>
            : <Button size="sm" variant="danger" disabled title="колонкой пользуются">Удалить</Button>}
          <Button size="sm" variant="ghost" title="свернуть" onClick={onClose}>×</Button>
        </>}
      />
      <div className="row">
        <Field label="Тип">
          <Select value={column.kind}
            options={(column.expr !== undefined ? [[BY_FORMULA, 'по формуле'], ...kinds] : kinds) as never}
            onChange={next => onChange({ kind: next as ValueKind | typeof BY_FORMULA })} />
        </Field>
        {column.kind === 'choice' ? (
          <>
            <Field label="Из таблицы" needed={!column.from}
              error={column.from ? undefined : tables.length
                ? 'выбирать не из чего, пока не указана таблица'
                : `выбирать не из чего: сперва заведите таблицу со строками — «${TABS.rules}» → «Таблицы»`}>
              <Select
                value={column.from ?? ''}
                options={[['', '— какая —'], ...tables] as never}
                onChange={next => onChange({ from: next || null })}
              />
            </Field>
            {many ? (
              <Field label="Сколько значений">
                <Select
                  value={column.many ? 'many' : 'one'}
                  options={[['one', 'одно'], ['many', 'несколько']] as const}
                  onChange={next => onChange({ many: next === 'many' })}
                />
              </Field>
            ) : null}
          </>
        ) : column.kind === 'number' && rowsOf?.length ? (
          <Field label="Строка таблицы">
            <Select
              value={column.from ?? ''}
              options={[['', 'нет — просто число'], ...rowsOf] as never}
              onChange={next => onChange({ from: next || null })}
            />
          </Field>
        ) : column.kind === 'column' ? (
          <Field label="Колонки какой таблицы">
            <Select
              value={column.from ?? ''}
              options={[['', '— какой —'], ...tables] as never}
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
          placeholder="нет — значение вписывают"
          onChange={next => onChange({ expr: next.trim() ? next : null })}
        />
      </Field>
      {preview}
      {lead}
      {(bounds && column.kind === 'number') || extra || hinted ? (
        <Fold title="ещё" summary="на листе, бросок, границы" open={more}>
          {bounds && column.kind === 'number' ? (
            <div className="row">
              <Field label="Не ниже">
                <BoundFormula value={column.min} system={system} where={`${where} · не ниже`} {...(table ? { table } : {})} {...(names ? { names } : {})} onChange={next => onChange({ min: next })} />
              </Field>
              <Field label="Не выше">
                <BoundFormula value={column.max} system={system} where={`${where} · не выше`} {...(table ? { table } : {})} {...(names ? { names } : {})} onChange={next => onChange({ max: next })} />
              </Field>
            </div>
          ) : null}
          {hinted ? (
            <Field label="Подсказка" hint="видна у подписи на листе">
              <span data-field="Подсказка">
                <TextArea value={column.hint ?? ''} placeholder="что это за значение" onChange={next => onChange({ hint: next.trim() ? next : null })} />
              </span>
            </Field>
          ) : null}
          {extra}
        </Fold>
      ) : null}
    </Card>
  );
}
