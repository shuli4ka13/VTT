import { BoundFormula } from '../bound-field.tsx';
import type { Bound } from '../bound-field.tsx';
import type { ReactNode } from 'react';
import { Card, CardHead, Field, Button, DangerButton, Fold, Select, LabelInput } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import type { System, ValueKind } from '@vtt/schema';

export interface ColumnShape {
  label: string;
  kind: ValueKind;
  from?: string;
  many?: boolean;
  expr?: string;
  min?: Bound;
  max?: Bound;
}

export interface ColumnPatch {
  label?: string;
  kind?: ValueKind;
  from?: string | null;
  many?: boolean;
  expr?: string | null;
  min?: Bound | null;
  max?: Bound | null;
}


export function ColumnCard({ column, kinds, tables, many, formulaHint, where, names, system, onChange, onDelete, onClose, lead, extra, preview, bounds = true, table }: {
  table?: string;
  column: ColumnShape;
  kinds: readonly (readonly [string, string])[];
  tables: [string, string][];
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
}) {
  return (
    <Card>
      <CardHead
        title={<LabelInput value={column.label} placeholder="как зовётся колонка" onCommit={label => onChange({ label })} />}
        actions={<>
          {onDelete ? <DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>
            : <Button size="sm" variant="danger" disabled title="колонкой пользуются">Удалить</Button>}
          <Button size="sm" variant="ghost" title="свернуть" onClick={onClose}>×</Button>
        </>}
      />
      <div className="row">
        <Field label="Тип">
          <Select value={column.kind} options={kinds as never} onChange={next => onChange({ kind: next as ValueKind })} />
        </Field>
        {column.kind === 'choice' ? (
          <>
            <Field label="Из таблицы">
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
      {(bounds && column.kind === 'number') || extra ? (
        <Fold title="ещё" summary="на листе, бросок, границы">
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
          {extra}
        </Fold>
      ) : null}
    </Card>
  );
}
