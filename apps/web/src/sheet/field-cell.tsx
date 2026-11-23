import { useState } from 'react';
import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput, Select, TextArea } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
import { VIEWS } from './views/index.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue, FieldOption } from '@vtt/schema';
import { MOST_STEPS, NOTE_LIMIT, isNoteField, optionsOf } from '@vtt/engine';
import type { Field as FieldModel } from '@vtt/engine';

export function FieldCell({ field, system, sheet, reader, onChange, onShift, onRoll, bare, mark }: {
  field: FieldModel;
  bare?: boolean;
  mark?: string;
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onShift?: (tag: string, by: number) => void;
  onRoll?: (tag: string) => void;
}) {
  const named: ReactNode = bare ? <span className="sr-only">{field.label}</span> : field.hint ? <span title={field.hint}>{field.label}</span> : field.label;
  const label: ReactNode = mark ? <>{named}<span className="field__mark">{mark}</span></> : named;
  const roll = field.roll && onRoll
    ? (
      <Button size="sm" title={field.roll.label ?? `Проверка: ${field.label}`} onClick={() => onRoll(field.tag)}>
        бросить
      </Button>
    )
    : null;
  const stored = field.value.kind === 'stored';
  const options = optionsOf(system, field);
  const computed = stored ? null : reader.valueOf(field.tag);
  const value = stored
    ? (reader.storedOf ? reader.storedOf(field.tag) : sheet.values[field.tag] ?? (field.value.kind === 'stored' ? field.value.default : undefined))
    : computed!.ok ? computed!.value : undefined;
  const editable = stored && onChange ? onChange : null;

  if (isNoteField(field)) {
    return <Note label={label} value={typeof value === 'string' ? value : ''} {...(editable ? { onCommit: (next: string) => editable(field.tag, next) } : {})} />;
  }

  const kind = field.control?.kind;
  const spec = kind ? VIEWS[kind] : null;
  const fits = spec && (stored ? Boolean(editable) || spec.shows : spec.shows) && spec.fits(value);
  if (spec && fits && (stored || computed!.ok)) {
    const { kind: _kind, ...settings } = field.control!;
    const write = editable ? (next: StoredValue) => editable(field.tag, next) : undefined;
    const min = boundOf(field.value.min, reader);
    const max = boundOf(field.value.max, reader);
    const boolean = field.value.kind === 'stored' ? field.value.type === 'boolean' : typeof value === 'boolean';
    const steps = (kind === 'ring' || kind === 'choice') && !options.length ? stepsOf(boolean, min, max, settings) : options;
    return (
      <Group label={label}>
        <div className={`v-cell v-cell--${kind}`}>
          <spec.draw
            value={value}
            label={field.label}
            min={min}
            max={max}
            options={steps}
            control={settings}
            {...(write ? { onChange: write } : {})}
            {...(write && onShift ? { onShift: (by: number) => onShift(field.tag, by) } : {})}
          />
          {roll}
        </div>
      </Group>
    );
  }

  if (!editable) {
    const shown = stored ? show({ ok: true, value }, options) : show(computed!, options);
    return <Shown label={label} text={shown.text} title={shown.title} bad={shown.bad} roll={roll} />;
  }

  const type = field.value.kind === 'stored' ? field.value.type : 'text';
  if (options.length && !(field.value.kind === 'stored' && field.value.many)) {
    return (
      <Field label={label}>
        <div className="inline inline--tight">
          <Select
            label={field.label}
            value={String(value ?? '')}
            options={[['', '— не выбрано —'], ...options.map(o => [String(o.value), o.label] as const)] as never}
            onChange={next => {
              const picked = options.find(o => String(o.value) === next);
              editable(field.tag, picked ? picked.value : '');
            }}
          />
          {roll}
        </div>
      </Field>
    );
  }

  if (field.value.kind === 'stored' && field.value.many) {
    return (
      <Group label={label}>
        <div className="v-cell v-cell--chips">
          <VIEWS.chips.draw value={value} label={field.label} options={options} onChange={next => editable(field.tag, next)} />
          {roll}
        </div>
      </Group>
    );
  }

  if (type === 'boolean') {
    return (
      <Group label={label}>
        <div className="v-cell v-cell--toggle">
          <VIEWS.toggle.draw value={value} label={field.label} onChange={next => editable(field.tag, next)} />
          {roll}
        </div>
      </Group>
    );
  }

  return (
    <Field label={label}>
      <div className="inline inline--tight">
        {type === 'number'
          ? <NumInput value={Number(value ?? 0)} onCommit={n => editable(field.tag, n)} />
          : <Input value={String(value ?? '')} onChange={next => editable(field.tag, next)} />}
        {roll}
      </div>
    </Field>
  );
}

function Note({ label, value, onCommit }: { label: ReactNode; value: string; onCommit?: (next: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!onCommit) {
    return (
      <div className="field field--wide">
        <span className="field__label">{label}</span>
        <div className="note-text">{value || '—'}</div>
      </div>
    );
  }
  return (
    <label className="field field--wide">
      <span className="field__label">{label}</span>
      <TextArea
        rows={3}
        max={NOTE_LIMIT}
        value={draft ?? value}
        onChange={setDraft}
        onBlur={() => {
          if (draft !== null && draft !== value) onCommit(draft);
          setDraft(null);
        }}
      />
    </label>
  );
}

function Group({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {children}
    </div>
  );
}

function Shown({ label, text, title, bad, roll }: {
  label: ReactNode; text: string; title?: string; bad?: boolean; roll?: ReactNode;
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

function stepsOf(boolean: boolean, min: number | undefined, max: number | undefined, control: { yes?: string; no?: string }): FieldOption[] {
  if (boolean) return [{ value: false, label: control.no ?? 'нет' }, { value: true, label: control.yes ?? 'да' }];
  if (min === undefined || max === undefined || max < min || max - min + 1 > MOST_STEPS) return [];
  return Array.from({ length: max - min + 1 }, (_, at) => ({ value: min + at, label: String(min + at) }));
}

function boundOf(bound: number | string | undefined, reader: Reader): number | undefined {
  if (typeof bound === 'number') return bound;
  if (typeof bound !== 'string' || !bound.trim()) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(bound.trim())) return Number(bound);
  const value = reader.measure ? reader.measure(bound) : (() => {
    const tag = /^[@#]([\p{L}\p{N}_.-]+)$/u.exec(bound.trim())?.[1];
    return tag ? reader.valueOf(tag) : null;
  })();
  return value?.ok && typeof value.value === 'number' ? value.value : undefined;
}
