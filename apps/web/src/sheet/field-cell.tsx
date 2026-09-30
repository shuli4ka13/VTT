import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput, Select } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
import { CONTROL_VIEWS } from './controls/index.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { optionsOf } from '@vtt/engine/model/lists';

export function FieldCell({ field: whole, system, sheet, reader, onChange, onRoll, bare }: {
  field: FieldModel;
  bare?: boolean;
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
}) {
  const field = bare ? { ...whole, label: '' } : whole;
  const roll = field.roll && onRoll
    ? (
      <Button size="sm" title={field.roll.label ?? `Проверка: ${whole.label}`} onClick={() => onRoll(field.tag)}>
        бросить
      </Button>
    )
    : null;

  if (field.value.kind === 'stored') {
    const stored = sheet.values[field.tag] ?? field.value.default;

    if (!onChange) return <Shown label={field.label} text={String(stored ?? '—')} roll={roll} />;

    const View = field.control ? CONTROL_VIEWS[field.control] : null;
    if (View) {
      const bounds = field.value.kind === 'stored' ? field.value : undefined;
      return (
        <Field label={field.label}>
          <div className="inline inline--tight">
            <View
              value={stored}
              label={field.label}
              min={typeof bounds?.min === 'number' ? bounds.min : undefined}
              max={typeof bounds?.max === 'number' ? bounds.max : boundOf(bounds?.max, reader)}
              options={optionsOf(system, field)}
              onChange={next => onChange(field.tag, field.value.kind === 'stored' && field.value.type === 'number' && typeof next === 'boolean' ? (next ? 1 : 0) : next)}
            />
            {roll}
          </div>
        </Field>
      );
    }

    const options = optionsOf(system, field);
    if (options.length) {
      return (
        <Field label={field.label}>
          <div className="inline inline--tight">
            <Select
              value={String(stored ?? '')}
              options={[['', '— не выбрано —'], ...options.map(o => [String(o.value), o.label] as const)] as never}
              onChange={next => {
                const picked = options.find(o => String(o.value) === next);
                onChange(field.tag, picked ? picked.value : '');
              }}
            />
            {roll}
          </div>
        </Field>
      );
    }

    if (field.value.type === 'boolean') {
      return (
        <Field label={field.label}>
          <div className="inline inline--tight">
            <Button variant={stored ? 'primary' : undefined} onClick={() => onChange(field.tag, !stored)}>
              {stored ? 'да' : 'нет'}
            </Button>
            {roll}
          </div>
        </Field>
      );
    }

    return (
      <Field label={field.label}>
        <div className="inline inline--tight">
          {field.value.type === 'number'
            ? <NumInput value={Number(stored ?? 0)} onCommit={n => onChange(field.tag, n)} />
            : <Input value={String(stored ?? '')} onChange={next => onChange(field.tag, next)} />}
          {roll}
        </div>
      </Field>
    );
  }

  const computed = show(reader.valueOf(field.tag));
  return <Shown label={field.label} text={computed.text} title={computed.title} bad={computed.bad} roll={roll} />;
}

function Shown({ label, text, title, bad, roll }: {
  label: string; text: string; title?: string; bad?: boolean; roll?: ReactNode;
}) {
  return (
    <Field label={label}>
      <div className="inline inline--tight">
        <div className={`input num input--shown ${bad ? 'input--bad' : ''}`} title={title}>{text}</div>
        {roll}
      </div>
    </Field>
  );
}

function boundOf(bound: unknown, reader: Reader): number | undefined {
  if (typeof bound !== 'string') return undefined;
  const tag = /^[@#]([\p{L}\p{N}_.-]+)$/u.exec(bound.trim())?.[1];
  if (!tag) return undefined;
  const value = reader.valueOf(tag);
  return value.ok && typeof value.value === 'number' ? value.value : undefined;
}
