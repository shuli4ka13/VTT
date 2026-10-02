import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { clamp, numberOf, signed, slotsOf, shareOf, toneOf } from './kit.ts';
import type { ViewProps } from './kit.ts';

function NumberDraft({ value, label, min, max, onChange, show, className }: ViewProps & { show: (n: number) => string; className: string }) {
  const now = numberOf(value);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const n = Number(text.replace(/^\+/, '').replace('−', '-').trim());
    if (text.trim() !== '' && Number.isFinite(n)) onChange?.(clamp(n, min, max));
    setDraft(null);
  };
  if (!onChange) return <span className={className} aria-label={label}>{show(now)}</span>;
  return (
    <input
      className={className}
      aria-label={label}
      inputMode="numeric"
      value={draft ?? show(now)}
      onFocus={() => setDraft(String(now))}
      onChange={event => setDraft(event.target.value)}
      onBlur={event => commit(event.target.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { setDraft(null); event.currentTarget.blur(); }
      }}
    />
  );
}

export function Signed(props: ViewProps) {
  return <NumberDraft {...props} show={signed} className="v-signed" />;
}

export function Big(props: ViewProps) {
  return <NumberDraft {...props} show={String} className="v-big" />;
}

export function Stepper({ value, label, min, max, onChange }: ViewProps) {
  const now = numberOf(value);
  return (
    <div className="v-stepper" role="group" aria-label={label}>
      <button type="button" className="v-stepper__btn" title="минус" disabled={!onChange || (min !== undefined && now <= min)}
        onClick={() => onChange?.(clamp(now - 1, min, max))}>−</button>
      <NumberDraft value={now} label={label} min={min} max={max} onChange={onChange} show={String} className="v-stepper__num" />
      <button type="button" className="v-stepper__btn" title="плюс" disabled={!onChange || (max !== undefined && now >= max)}
        onClick={() => onChange?.(clamp(now + 1, min, max))}>+</button>
    </div>
  );
}

export function Slider(props: ViewProps) {
  const { value, label, min = 0, max, onChange } = props;
  if (typeof max !== 'number') return <Stepper {...props} />;
  const now = numberOf(value);
  const share = shareOf(now, min, max);
  return (
    <div className="v-slider" style={{ '--share': `${share * 100}%` } as never}>
      <input type="range" aria-label={label} min={min} max={max} step={1} value={now}
        disabled={!onChange} onChange={event => onChange?.(Number(event.target.value))} />
      <span className="v-slider__value">{now}</span>
    </div>
  );
}

export function Pips({ value, label, min = 0, max, onChange }: ViewProps) {
  const now = numberOf(value);
  const slots = slotsOf(max, now);
  if (!slots) return <span className="v-empty" aria-label={label}>нет</span>;
  return (
    <div className="v-pips" role="group" aria-label={label}>
      {Array.from({ length: slots }, (_, at) => at + 1).map(step => (
        <button
          key={step}
          type="button"
          className={`v-pip${step <= now ? ' v-pip--on' : ''}`}
          aria-pressed={step <= now}
          aria-label={`${step} из ${slots}`}
          disabled={!onChange}
          onClick={() => onChange?.(clamp(step === now ? step - 1 : step, min, max))}
        />
      ))}
      <span className="v-count">{now}/{slots}</span>
    </div>
  );
}

export function Charges({ value, label, min = 0, max, onChange }: ViewProps) {
  const now = numberOf(value);
  const slots = slotsOf(max, now);
  if (!slots) return <span className="v-empty" aria-label={label}>нет</span>;
  const r = 15;
  const sector = (at: number) => {
    const from = (at / slots) * 2 * Math.PI - Math.PI / 2;
    const to = ((at + 1) / slots) * 2 * Math.PI - Math.PI / 2;
    if (slots === 1) return `M16,1 A${r},${r} 0 1,1 15.99,1 Z`;
    const large = to - from > Math.PI ? 1 : 0;
    return `M16,16 L${16 + r * Math.cos(from)},${16 + r * Math.sin(from)} A${r},${r} 0 ${large},1 ${16 + r * Math.cos(to)},${16 + r * Math.sin(to)} Z`;
  };
  return (
    <div className="v-charges" role="group" aria-label={label}>
      <svg viewBox="0 0 32 32" className="v-charges__pie">
        {Array.from({ length: slots }, (_, at) => (
          <path
            key={at}
            d={sector(at)}
            className={`v-charges__part${at < now ? ' v-charges__part--on' : ''}`}
            role="button"
            aria-label={`${at + 1} из ${slots}`}
            aria-pressed={at < now}
            aria-disabled={!onChange}
            tabIndex={onChange ? 0 : -1}
            onClick={() => onChange?.(clamp(at + 1 === now ? at : at + 1, min, max))}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onChange?.(clamp(at + 1 === now ? at : at + 1, min, max)); } }}
          />
        ))}
      </svg>
      <span className="v-count">{now}/{slots}</span>
    </div>
  );
}

export function Bar({ value, label, min = 0, max, onChange }: ViewProps) {
  const now = numberOf(value);
  const top = typeof max === 'number' && max > min ? max : Math.max(now, min + 1);
  const share = shareOf(now, min, top);
  return (
    <div className="v-bar">
      <div className={`v-bar__track v-bar__track--${toneOf(share)}`} title={`${label}: ${now} из ${top}`}>
        <div className="v-bar__fill" style={{ width: `${share * 100}%` }} />
        <span className="v-bar__text">{now} / {top}</span>
      </div>
      {onChange ? <Stepper value={now} label={label} min={min} max={max} onChange={onChange} /> : null}
    </div>
  );
}
