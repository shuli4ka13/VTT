import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
import { CONTROL_VIEWS } from './controls/index.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, Field as FieldModel, StoredValue } from '@vtt/schema';

export function FieldCell({ field, sheet, reader, onChange, onRoll }: {
  field: FieldModel;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
}) {
  const roll = field.roll && onRoll
    ? (
      <Button size="sm" title={field.roll.label ?? `Проверка: ${field.label}`} onClick={() => onRoll(field.tag)}>
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
              options={field.options}
              onChange={next => onChange(field.tag, next)}
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
  const tag = /^#([\p{L}\p{N}_-]+)$/u.exec(bound.trim())?.[1];
  if (!tag) return undefined;
  const value = reader.valueOf(tag);
  return value.ok && typeof value.value === 'number' ? value.value : undefined;
}
