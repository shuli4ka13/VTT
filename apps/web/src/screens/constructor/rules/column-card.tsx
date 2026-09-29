import type { ReactNode } from 'react';
import { Card, CardHead, Field, Input, Button, DangerButton, Fold, Select, LabelInput } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import type { System, ValueKind } from '@vtt/schema';

export interface ColumnShape {
  label: string;
  kind: ValueKind;
  from?: string;
  many?: boolean;
  expr?: string;
  min?: string | number;
  max?: string | number;
}

export interface ColumnPatch {
  label?: string;
  kind?: ValueKind;
  from?: string | null;
  many?: boolean;
  expr?: string | null;
  min?: string | number | null;
  max?: string | number | null;
}

const bound = (text: string): string | number | null =>
  (!text.trim() ? null : /^-?\d+$/.test(text) ? Number(text) : text);

export function ColumnCard({ column, kinds, tables, many, formulaHint, where, names, system, onChange, onDelete, onClose, extra, preview }: {
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
          {...(names ? { extraNames: names } : {})}
          placeholder="нет — значение вписывают"
          onChange={next => onChange({ expr: next.trim() ? next : null })}
        />
      </Field>
      {preview}
      {column.kind === 'number' || extra ? (
        <Fold title="ещё">
          {column.kind === 'number' ? (
            <div className="row">
              <Field label="Не ниже">
                <Input mono value={column.min === undefined ? '' : String(column.min)} onChange={text => onChange({ min: bound(text) })} />
              </Field>
              <Field label="Не выше">
                <Input mono value={column.max === undefined ? '' : String(column.max)} onChange={text => onChange({ max: bound(text) })} />
              </Field>
            </div>
          ) : null}
          {extra}
        </Fold>
      ) : null}
    </Card>
  );
}
