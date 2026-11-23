import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { MOST_DOTS, clamp, numberOf, signed, shareOf, toneOf, roundTo } from './kit.ts';
import type { ViewProps } from './kit.ts';
import { t, useT } from '../../i18n/index.ts';

export function Missing({ label, needs }: { label: string; needs: string }) {
  const t = useT('sheet');
  return <span className="v-missing" aria-label={label} title={t('view.missing', { needs })}>—</span>;
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

const MINUS = '−';

const amountOf = (text: string): { by: number } | { to: number } | null => {
  const clean = text.replace(/\s+/g, '').replace(MINUS, '-').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) return null;
  return /^[+-]/.test(clean) ? { by: Number(clean) } : { to: Number(clean) };
};

const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

function Quick({ value, label, min, max, control, onChange, onShift, asks }: ViewProps & { asks?: boolean }) {
  const t = useT('sheet');
  const now = numberOf(value);
  const step = control?.step ?? 1;
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const prefilled = useRef(false);
  const shift = (by: number) => {
    if (!onChange || !by) return;
    if (now === null) onChange(clamp((min ?? 0) + by, min, max));
    else if (onShift) onShift(by);
    else onChange(clamp(now + by, min, max));
  };
  const commit = (text: string) => {
    const amount = amountOf(text);
    setDraft(null);
    if (!amount) return;
    if ('by' in amount) shift(amount.by);
    else if (amount.to !== now) onChange?.(clamp(amount.to, min, max));
  };
  const press = (sign: 1 | -1) => {
    const typed = draft === null ? null : amountOf(draft);
    if (typed) {
      setDraft(null);
      shift(sign * Math.abs('by' in typed ? typed.by : typed.to));
    } else if (asks) {
      prefilled.current = true;
      setDraft(sign < 0 ? MINUS : '+');
      input.current?.focus();
    } else if (now === null) onChange?.(clamp(min ?? 0, min, max));
    else shift(sign * step);
  };
  const low = !onChange || (draft === null && min !== undefined && now !== null && now <= min);
  const high = !onChange || (draft === null && max !== undefined && now !== null && now >= max);
  const shown = now === null ? '' : String(now);
  return (
    <div className="v-stepper" role="group" aria-label={label}>
      <button type="button" className={`v-stepper__btn${asks && control?.minus ? ' v-stepper__btn--named' : ''}`} disabled={low}
        title={asks ? t('view.minus') : t('view.minusPlain')}
        onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => press(-1)}>{(asks && control?.minus) || MINUS}</button>
      {onChange ? (
        <input
          ref={input}
          className="v-stepper__num"
          aria-label={label}
          inputMode="numeric"
          placeholder="—"
          value={draft ?? shown}
          onFocus={event => { if (prefilled.current) prefilled.current = false; else event.currentTarget.select(); }}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => { if (draft !== null) commit(draft); }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setDraft(null);
          }}
        />
      ) : <span className="v-stepper__num" aria-label={label}>{shown || '—'}</span>}
      <button type="button" className={`v-stepper__btn${asks && control?.plus ? ' v-stepper__btn--named' : ''}`} disabled={high}
        title={asks ? t('view.plus') : t('view.plusPlain')}
        onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => press(1)}>{(asks && control?.plus) || '+'}</button>
    </div>
  );
}

export function Stepper(props: ViewProps) {
  return <Quick {...props} />;
}

export function Slider({ value, label, min, max, control, onChange }: ViewProps) {
  if (typeof max !== 'number' || typeof min !== 'number') {
    return <Missing label={label} needs={[typeof min !== 'number' ? t('sheet:view.needs.min') : '', typeof max !== 'number' ? t('sheet:view.needs.max') : ''].filter(Boolean).join(t('sheet:view.needs.join'))} />;
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
  if (typeof max !== 'number') return <Missing label={label} needs={t('sheet:view.needs.max')} />;
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
            aria-label={t('sheet:view.of', { n: step, total: slots })}
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
                aria-label={t('sheet:view.of', { n: at + 1, total: slots })}
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

export function Bar({ value, label, min = 0, max, control, onChange, onShift }: ViewProps) {
  if (typeof max !== 'number') return <Missing label={label} needs={t('sheet:view.needs.max')} />;
  const now = numberOf(value);
  const share = now === null ? 0 : shareOf(now, min, max);
  return (
    <div className="v-bar">
      <div className={`v-bar__track v-bar__track--${toneOf(share, control?.worse)}`} title={t('sheet:view.barTitle', { label, now: now ?? '—', max })}>
        <div className="v-bar__fill" style={{ width: `${share * 100}%` }} />
        <span className="v-bar__text">{now ?? '—'} / {max}</span>
      </div>
      {onChange ? <Quick value={now} label={label} min={min} max={max} control={control} onChange={onChange} onShift={onShift} asks /> : null}
    </div>
  );
}
