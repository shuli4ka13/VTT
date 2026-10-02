import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput, Select } from '../ui/primitives.tsx';
import { show } from '../engine/use-calc.ts';
import { VIEWS } from './views/index.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { optionsOf } from '@vtt/engine/model/lists';

export function FieldCell({ field, system, sheet, reader, onChange, onRoll, bare }: {
  field: FieldModel;
  bare?: boolean;
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
}) {
  const label: ReactNode = bare ? <span className="sr-only">{field.label}</span> : field.label;
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

  const spec = field.control ? VIEWS[field.control] : null;
  const fits = spec && (stored ? Boolean(editable) || spec.shows : spec.shows) && (value === undefined || value === null || spec.fits(value));
  if (spec && fits && (stored || computed!.ok)) {
    const write = editable
      ? (next: StoredValue) => editable(field.tag, field.value.kind === 'stored' && field.value.type === 'number' && typeof next === 'boolean' ? (next ? 1 : 0) : next)
      : undefined;
    return (
      <Group label={label}>
        <div className={`v-cell v-cell--${field.control}`}>
          <spec.draw
            value={value}
            label={field.label}
            min={boundOf(field.value.min, reader)}
            max={boundOf(field.value.max, reader)}
            options={options}
            {...(write ? { onChange: write } : {})}
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
