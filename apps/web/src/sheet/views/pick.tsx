import { useState } from 'react';
import { labelOf, listOf, same } from './kit.ts';
import type { ViewProps } from './kit.ts';
import type { FieldOption } from '@vtt/schema';

export function Toggle({ value, label, control, onChange }: ViewProps) {
  const on = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className={`v-toggle${on ? ' v-toggle--on' : ''}`}
      disabled={!onChange}
      onClick={() => onChange?.(!on)}
    >
      <span className="v-toggle__track"><span className="v-toggle__knob" /></span>
      <span className="v-toggle__text">{on ? control?.yes ?? 'да' : control?.no ?? 'нет'}</span>
    </button>
  );
}

export function Ring({ value, label, options, onChange }: ViewProps) {
  const steps = options ?? [];
  if (!steps.length) return <span className="v-empty" title="ступени — строки таблицы вариантов; задаются в конструкторе">вариантов ещё нет</span>;
  const at = steps.findIndex(step => same(step.value, value));
  const share = at < 0 ? 0 : steps.length > 1 ? at / (steps.length - 1) : 1;
  const length = 2 * Math.PI * 8;
  const next = steps[(at + 1) % steps.length]!;
  const name = at < 0 ? '—' : steps[at]!.label;
  return (
    <button
      type="button"
      className={`v-ring${at > 0 ? ' v-ring--on' : ''}`}
      title={`${label}: ${name}. Клик — следующая ступень.`}
      disabled={!onChange}
      onClick={() => onChange?.(next.value)}
    >
      <svg viewBox="0 0 20 20" className="v-ring__mark" aria-hidden="true">
        <circle cx="10" cy="10" r="8" className="v-ring__base" />
        <circle cx="10" cy="10" r="8" className="v-ring__arc"
          strokeDasharray={`${share * length} ${length}`} transform="rotate(-90 10 10)" />
        {share >= 1 && steps.length > 1 ? <circle cx="10" cy="10" r="3.5" className="v-ring__core" /> : null}
      </svg>
      <span className="v-ring__text">{name}</span>
    </button>
  );
}

export function Choice({ value, label, options, onChange }: ViewProps) {
  const list = options ?? [];
  if (!list.length) return <span className="v-empty">вариантов ещё нет</span>;
  return (
    <div className="v-segments" role="radiogroup" aria-label={label}>
      {list.map(option => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={same(option.value, value)}
          className={`v-segments__item${same(option.value, value) ? ' v-segments__item--on' : ''}`}
          disabled={!onChange}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ value, label, options, onChange }: ViewProps) {
  const picked = listOf(value);
  const list = options?.length ? options : picked.map(item => ({ value: item as FieldOption['value'], label: String(item) }));
  if (!onChange) {
    return picked.length
      ? <div className="v-chips" aria-label={label}>{picked.map(item => <span key={String(item)} className="v-chip v-chip--on">{labelOf(options, item)}</span>)}</div>
      : <span className="v-empty">—</span>;
  }
  if (!list.length) return <span className="v-empty">вариантов ещё нет</span>;
  const flip = (item: FieldOption['value']) => {
    const on = picked.some(p => same(p, item));
    const next = on ? picked.filter(p => !same(p, item)) : [...picked, item];
    onChange(list.map(o => o.value).filter(v => next.some(p => same(p, v))) as never);
  };
  return (
    <div className="v-chips" role="group" aria-label={label}>
      {list.map(option => {
        const on = picked.some(p => same(p, option.value));
        return (
          <button key={String(option.value)} type="button" aria-pressed={on}
            className={`v-chip${on ? ' v-chip--on' : ''}`} onClick={() => flip(option.value)}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Die({ value, label, onChange }: ViewProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = String(value ?? '');
  if (!onChange) return <span className="v-die" aria-label={label}>{text || '—'}</span>;
  return (
    <label className="v-die">
      <span className="v-die__mark" aria-hidden="true">⬢</span>
      <input
        aria-label={label}
        value={draft ?? text}
        onChange={event => setDraft(event.target.value)}
        onBlur={event => { if (event.target.value !== text) onChange(event.target.value); setDraft(null); }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      />
    </label>
  );
}
