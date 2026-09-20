import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
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
