import { useState } from 'react';
import type { ReactNode } from 'react';
import { Field, Input, Button, NumInput, Select, TextArea } from '../ui/primitives.tsx';
import { t as say, useT } from '../i18n/index.ts';
import { show } from '../engine/use-calc.ts';
import { VIEWS } from './views/index.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue, FieldOption } from '@vtt/schema';
import { MOST_STEPS, NOTE_LIMIT, isNoteField, optionsOf, toDice, asDice } from '@vtt/engine';
import type { Field as FieldModel, Shift } from '@vtt/engine';
import { missingOf } from './missing.ts';

export function FieldCell(props: Parameters<typeof Cell>[0]) {
  const missing = props.editing && props.onChange ? missingOf(props.system, props.sheet, props.field) : null;
  return missing ? <div className="field-missing"><Cell {...props} /></div> : <Cell {...props} />;
}

function Cell({ field, system, sheet, reader, onChange: write0, onShift, onRoll, bare, mark, editing }: {
  field: FieldModel;
  editing?: boolean;
  bare?: boolean;
  mark?: string;
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onShift?: (tag: string, by: number) => void;
  onRoll?: (tag: string) => void;
}) {
  const t = useT('sheet');
  const named: ReactNode = bare ? <span className="sr-only">{field.label}</span> : field.hint ? <span title={field.hint}>{field.label}</span> : field.label;
  const missing = editing && write0 ? missingOf(system, sheet, field) : null;
  const marked: ReactNode = mark ? <>{named}<span className="field__mark">{mark}</span></> : named;
  const label: ReactNode = missing ? <>{marked}<span className="field__missing">{t(`missing.${missing}`)}</span></> : marked;
  const roll = field.roll && onRoll
    ? (
      <Button size="sm" title={field.roll.label ?? t('field.check', { label: field.label })} onClick={() => onRoll(field.tag)}>
        {t('field.roll')}
      </Button>
    )
    : null;
  const options = optionsOf(system, field);
  const shift = field.value.kind === 'stored' && reader.shiftOf ? reader.shiftOf(field.tag) : null;
  const totalShown = Boolean(shift) && !editing;
  const stored = field.value.kind === 'stored' && !totalShown;
  const computed = stored ? null : totalShown ? { ok: true as const, value: shift!.total } : reader.valueOf(field.tag);
  const value = stored
    ? (reader.storedOf ? reader.storedOf(field.tag) : sheet.values[field.tag] ?? (field.value.kind === 'stored' ? field.value.default : undefined))
    : computed!.ok ? computed!.value : undefined;
  const kind = field.control?.kind;
  const spec = kind ? VIEWS[kind] : null;
  const boolean = field.value.kind === 'stored' ? field.value.type === 'boolean' : typeof value === 'boolean';
  const plays = spec ? spec.plays : boolean && !options.length;
  const onChange = editing === false && !plays ? undefined : totalShown ? towardTotal(shift!, write0, onShift) : write0;
  const editable = (stored || totalShown) && onChange ? onChange : null;
  const plaque = shift && !sameValue(shift.base, shift.total) ? <ShiftPlaque shift={shift} editing={Boolean(editing)} /> : null;
  const tail = plaque ? <>{plaque}{roll}</> : roll;

  if (isNoteField(field)) {
    return <Note label={label} value={typeof value === 'string' ? value : ''} {...(editable ? { onCommit: (next: string) => editable(field.tag, next) } : {})} />;
  }

  const fits = spec && (stored || totalShown ? Boolean(editable) || spec.shows : spec.shows) && spec.fits(value);
  if (spec && fits && (stored || computed!.ok)) {
    const { kind: _kind, ...settings } = field.control!;
    const write = editable ? (next: StoredValue) => editable(field.tag, next) : undefined;
    const min = boundOf(field.value.min, reader);
    const max = boundOf(field.value.max, reader);
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
          {tail}
        </div>
      </Group>
    );
  }

  if (!editable) {
    const shown = stored ? show({ ok: true, value }, options, field.dice) : show(computed!, options, true);
    return <Shown label={label} text={shown.text} title={shown.title} bad={shown.bad} roll={tail} kept={field.value.kind === 'stored'} />;
  }

  const type = field.value.kind === 'stored' ? field.value.type : 'text';
  if (options.length && !(field.value.kind === 'stored' && field.value.many)) {
    return (
      <Field label={label}>
        <div className="inline inline--tight">
          <Select
            label={field.label}
            value={String(value ?? '')}
            options={[['', t('field.unset')], ...options.map(o => [String(o.value), o.label] as const)] as never}
            onChange={next => {
              const picked = options.find(o => String(o.value) === next);
              editable(field.tag, picked ? picked.value : '');
            }}
          />
          {tail}
        </div>
      </Field>
    );
  }

  if (field.value.kind === 'stored' && field.value.many) {
    return (
      <Group label={label}>
        <div className="v-cell v-cell--chips">
          <VIEWS.chips.draw value={value} label={field.label} options={options} onChange={next => editable(field.tag, next)} />
          {tail}
        </div>
      </Group>
    );
  }

  if (type === 'boolean') {
    return (
      <Group label={label}>
        <div className="v-cell v-cell--toggle">
          <VIEWS.toggle.draw value={value} label={field.label} onChange={next => editable(field.tag, next)} />
          {tail}
        </div>
      </Group>
    );
  }

  return (
    <Field label={label}>
      <div className="inline inline--tight">
        {type === 'number'
          ? <NumInput value={Number(value ?? 0)} onCommit={n => editable(field.tag, n)} />
          : <Input value={field.dice ? asDice(String(value ?? '')) : String(value ?? '')} onChange={next => editable(field.tag, field.dice ? toDice(next) : next)} />}
        {tail}
      </div>
    </Field>
  );
}

function towardTotal(
  shift: Shift,
  write: ((tag: string, value: StoredValue) => void) | undefined,
  move: ((tag: string, by: number) => void) | undefined,
): ((tag: string, value: StoredValue) => void) | undefined {
  if (!write || !shift.additive || typeof shift.total !== 'number' || typeof shift.base !== 'number') return undefined;
  const total = shift.total;
  return (tag, next) => {
    if (typeof next !== 'number') return;
    const by = next - total;
    if (!by) return;
    if (move) move(tag, by);
    else write(tag, (shift.base as number) + by);
  };
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function ShiftPlaque({ shift, editing }: { shift: Shift; editing: boolean }) {
  const t = useT('sheet');
  const from = shift.from.map(one => (one.count > 1 ? `${one.label} ×${one.count}` : one.label)).join(', ');
  const numeric = typeof shift.total === 'number' && typeof shift.base === 'number';
  const by = numeric ? (shift.total as number) - (shift.base as number) : 0;
  const text = !numeric ? t('shift.changed')
    : editing ? t('shift.total', { total: shift.total })
      : `${by > 0 ? '↑' : '↓'} ${by > 0 ? '+' : '−'}${Math.abs(by)}`;
  const title = numeric
    ? t('shift.title', { base: shift.base, total: shift.total, from })
    : t('shift.titleText', { from });
  return <span className="shift-plaque" title={title}>{text}</span>;
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

function Shown({ label, text, title, bad, roll, kept }: {
  label: ReactNode; text: string; title?: string; bad?: boolean; roll?: ReactNode; kept?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="inline inline--tight">
        <div className={`input num input--shown ${kept ? 'input--kept' : ''} ${bad ? 'input--bad' : ''}`} title={title}>{text}</div>
        {roll}
      </div>
    </Field>
  );
}

function stepsOf(boolean: boolean, min: number | undefined, max: number | undefined, control: { yes?: string; no?: string }): FieldOption[] {
  if (boolean) return [{ value: false, label: control.no ?? say('common:no') }, { value: true, label: control.yes ?? say('common:yes') }];
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
