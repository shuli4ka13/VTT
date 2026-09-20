import { Field, Input, Button, NumInput } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, Field as FieldModel, StoredValue } from '@vtt/schema';

export function FieldCell({ field, sheet, reader, onChange }: {
  field: FieldModel;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
}) {
  if (field.value.kind === 'stored') {
    const stored = sheet.values[field.tag] ?? field.value.default;

    if (!onChange) return <Shown label={field.label} text={String(stored ?? '—')} />;

    if (field.value.type === 'boolean') {
      return (
        <Field label={field.label}>
          <Button variant={stored ? 'primary' : undefined} onClick={() => onChange(field.tag, !stored)}>
            {stored ? 'да' : 'нет'}
          </Button>
        </Field>
      );
    }

    return (
      <Field label={field.label}>
        {field.value.type === 'number'
          ? <NumInput value={Number(stored ?? 0)} onCommit={n => onChange(field.tag, n)} />
          : <Input value={String(stored ?? '')} onChange={next => onChange(field.tag, next)} />}
      </Field>
    );
  }

  const computed = show(reader.valueOf(field.tag));
  return <Shown label={field.label} text={computed.text} title={computed.title} bad={computed.bad} />;
}

function Shown({ label, text, title, bad }: { label: string; text: string; title?: string; bad?: boolean }) {
  return (
    <Field label={label}>
      <div className={`input num input--shown ${bad ? 'input--bad' : ''}`} title={title}>{text}</div>
    </Field>
  );
}
