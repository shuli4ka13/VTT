import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { MOST_DOTS, clamp, numberOf, signed, shareOf, toneOf, roundTo } from './kit.ts';
import type { ViewProps } from './kit.ts';

export function Missing({ label, needs }: { label: string; needs: string }) {
  return <span className="v-missing" aria-label={label} title={`виду не хватает: ${needs} — задаётся в конструкторе`}>—</span>;
}

function NumberDraft({ value, label, min, max, onChange, show, className }: ViewProps & { show: (n: number) => string; className: string }) {
  const now = numberOf(value);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const n = Number(text.replace(/^\+/, '').replace('−', '-').trim());
    if (text.trim() !== '' && Number.isFinite(n) && n !== now) onChange?.(clamp(n, min, max));
    setDraft(null);
  };
  const shown = now === null ? '' : show(now);
  if (!onChange) return <span className={className} aria-label={label}>{shown || '—'}</span>;
  return (
    <input
      className={className}
      aria-label={label}
      inputMode="numeric"
      placeholder="—"
      value={draft ?? shown}
      onFocus={() => setDraft(now === null ? '' : String(now))}
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

export function Stepper({ value, label, min, max, control, onChange }: ViewProps) {
  const now = numberOf(value);
  const step = control?.step ?? 1;
  const from = now ?? min ?? 0;
  return (
    <div className="v-stepper" role="group" aria-label={label}>
      <button type="button" className="v-stepper__btn" title="минус" disabled={!onChange || (min !== undefined && now !== null && now <= min)}
        onClick={() => onChange?.(clamp(now === null ? from : from - step, min, max))}>−</button>
      <NumberDraft value={now} label={label} min={min} max={max} onChange={onChange} show={String} className="v-stepper__num" />
      <button type="button" className="v-stepper__btn" title="плюс" disabled={!onChange || (max !== undefined && now !== null && now >= max)}
        onClick={() => onChange?.(clamp(now === null ? from : from + step, min, max))}>+</button>
    </div>
  );
}

export function Slider({ value, label, min, max, control, onChange }: ViewProps) {
  if (typeof max !== 'number' || typeof min !== 'number') {
    return <Missing label={label} needs={[typeof min !== 'number' ? 'низ' : '', typeof max !== 'number' ? 'верх' : ''].filter(Boolean).join(' и ')} />;
  }
  const step = control?.step ?? 1;
  const now = numberOf(value);
  const share = now === null ? 0 : shareOf(now, min, max);
  return (
    <div className="v-slider" style={{ '--share': `${share * 100}%` } as never}>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={now ?? min}
        disabled={!onChange} onChange={event => onChange?.(clamp(roundTo(Number(event.target.value), step, min), min, max))} />
      <span className="v-slider__value">{now ?? '—'}</span>
    </div>
  );
}

function Dots({ value, label, min = 0, max, onChange, render }: ViewProps & {
  render: (slots: number, now: number, pick: (at: number) => void) => ReactNode;
}) {
  if (typeof max !== 'number') return <Missing label={label} needs="верх" />;
  const now = numberOf(value);
  const slots = Math.max(0, Math.round(max));
  if (slots > MOST_DOTS || slots === 0) return <span className="v-count" aria-label={label}>{now ?? '—'} / {max}</span>;
  const pick = (at: number) => onChange?.(clamp(at === now ? at - 1 : at, min, max));
  return <>{render(slots, now ?? 0, pick)}</>;
}

export function Pips(props: ViewProps) {
  const { label, onChange } = props;
  return (
    <Dots {...props} render={(slots, now, pick) => (
      <div className="v-pips" role="group" aria-label={label}>
        {Array.from({ length: slots }, (_, at) => at + 1).map(step => (
          <button
            key={step}
            type="button"
            className={`v-pip${step <= now ? ' v-pip--on' : ''}`}
            aria-pressed={step <= now}
            aria-label={`${step} из ${slots}`}
            disabled={!onChange}
            onClick={() => pick(step)}
          />
        ))}
        <span className="v-count">{now}/{slots}</span>
      </div>
    )} />
  );
}

export function Charges(props: ViewProps) {
  const { label, onChange } = props;
  return (
    <Dots {...props} render={(slots, now, pick) => {
      const r = 15;
      const sector = (at: number) => {
        if (slots === 1) return `M16,1 A${r},${r} 0 1,1 15.99,1 Z`;
        const from = (at / slots) * 2 * Math.PI - Math.PI / 2;
        const to = ((at + 1) / slots) * 2 * Math.PI - Math.PI / 2;
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
                onClick={() => pick(at + 1)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(at + 1); } }}
              />
            ))}
          </svg>
          <span className="v-count">{now}/{slots}</span>
        </div>
      );
    }} />
  );
}

export function Bar({ value, label, min = 0, max, control, onChange }: ViewProps) {
  if (typeof max !== 'number') return <Missing label={label} needs="верх" />;
  const now = numberOf(value);
  const share = now === null ? 0 : shareOf(now, min, max);
  return (
    <div className="v-bar">
      <div className={`v-bar__track v-bar__track--${toneOf(share, control?.worse)}`} title={`${label}: ${now ?? '—'} из ${max}`}>
        <div className="v-bar__fill" style={{ width: `${share * 100}%` }} />
        <span className="v-bar__text">{now ?? '—'} / {max}</span>
      </div>
      {onChange ? <Stepper value={now} label={label} min={min} max={max} control={control} onChange={onChange} /> : null}
    </div>
  );
}
