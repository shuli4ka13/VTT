import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Combo } from './combo.tsx';
import { createPortal } from 'react-dom';
import type { ReactNode, ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import { useFocusNew } from './focus-new.ts';

export function Card({ children, tone, className = '', label }: {
  children: ReactNode;
  tone?: 'bad' | 'flat' | 'check' | 'change' | 'number' | 'table';
  className?: string;
  label?: string;
}) {
  return <div className={`card ${tone ? `card--${tone}` : ''} ${className}`} {...(label ? { role: 'group', 'aria-label': label } : {})}>{children}</div>;
}

export function CardHead({ title, sub, badge, actions }: {
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card__headline">
      <div className="card__head">
        <h3 className="card__title">{title}{badge}</h3>
        {actions ? <div className="inline inline--tight">{actions}</div> : null}
      </div>
      {sub ? <p className="card__sub">{sub}</p> : null}
    </div>
  );
}

export function Field({ label, hint, tip, error, needed, children }: {
  label: ReactNode;
  hint?: ReactNode;
  tip?: string;
  error?: ReactNode;
  needed?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field ${needed ? 'field--needed' : ''}`} {...(tip ? { title: tip } : {})}>
      <span className="field__label">{label}{needed ? <span aria-hidden>·заполнить</span> : null}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
}

export function Input({ value, onChange, placeholder, mono, invalid, type = 'text', onBlur, onFocus, onKeyDown, autoFocus }: {
  autoFocus?: boolean;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  type?: string;

  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useFocusNew(ref);
  return (
    <input
      ref={ref}
      className={`input ${mono ? 'input--mono' : ''} ${invalid ? 'input--bad' : ''}`}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
    />
  );
}

export function TextArea({ value, onChange, placeholder, invalid, rows = 2, onBlur }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  rows?: number;
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    if (node.scrollHeight) node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`input textarea textarea--auto ${invalid ? 'input--bad' : ''}`}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function LabelInput({ value, onCommit, placeholder }: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      value={draft ?? value}
      placeholder={placeholder}
      onChange={setDraft}
      onFocus={e => e.currentTarget.select()}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="tip" title={text} aria-label={text}>
      {children}
      <span className="tip__mark" aria-hidden>ⓘ</span>
    </span>
  );
}

export function NumInput({ value, onCommit, int, least, mono, placeholder }: {
  value: number;
  onCommit: (n: number) => void;

  int?: boolean;

  least?: number;
  mono?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      mono={mono}
      placeholder={placeholder}
      value={draft ?? String(value)}
      onChange={text => {
        setDraft(text);
        const n = Number(text);
        if (!Number.isFinite(n) || text.trim() === '') return;
        if (int && !Number.isInteger(n)) return;
        if (least !== undefined && n < least) return;
        onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Select<T extends string>({ value, options, onChange, disabled, title, label }: {
  value: T;
  label?: string;
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
}) {

  const blank = options.find(([key]) => key === '')?.[1];
  return (
    <Combo
      look="select"
      value={value}
      {...(blank ? { blank } : {})}
      {...(label ? { label } : {})}
      {...(title ? { title } : {})}
      {...(disabled ? { disabled } : {})}
      options={options.map(([key, text, group]) => ({ value: key, label: text, ...(group ? { group } : {}) }))}
      onChange={next => { if (next !== value) onChange(next as T); }}
    />
  );
}

export function Button({ children, onClick, onMouseEnter, variant, size, wide, disabled, title, ariaLabel }: {
  children: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  wide?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const classes = ['btn'];
  if (variant) classes.push(`btn--${variant}`);
  if (size) classes.push(`btn--${size}`);
  if (wide) classes.push('btn--wide');
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} onMouseEnter={onMouseEnter} disabled={disabled} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function DangerButton({ children, onConfirm, size, title, keep }: {
  children: ReactNode;
  onConfirm: () => void;
  size?: 'sm';
  title?: string;
  keep?: { label: string; run: () => void } | undefined;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button size={size} variant="danger" title={title} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="danger-confirm">
      <Button size={size} variant="danger" onClick={onConfirm}>{keep ? 'вместе с шагами' : 'точно убрать'}</Button>
      {keep ? <Button size={size} variant="ghost" onClick={keep.run}>{keep.label}</Button> : null}
      <Button size={size} variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { key: T; label: string; icon?: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map(option => (
        <button
          key={option.key}
          type="button"
          className="segmented__item"
          aria-pressed={option.key === value}
          title={option.title}
          onClick={() => onChange(option.key)}
        >
          {option.icon ? <span aria-hidden>{option.icon}</span> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, onClick, onRemove, active, title }: {
  children: ReactNode;
  onClick?: () => void;
  onRemove?: () => void;
  active?: boolean;
  title?: string;
}) {
  const classes = ['chip'];
  if (onClick) classes.push('chip--action');
  if (active) classes.push('chip--on');
  return (
    <span
      className={classes.join(' ')} title={title} onClick={onClick}
      {...(onClick ? {
        role: 'button', tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
      } : {})}
    >
      <span className="nowrap">{children}</span>
      {onRemove ? (
        <button type="button" className="chip__x" aria-label="убрать" onClick={e => { e.stopPropagation(); onRemove(); }}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function Verdict({ tone, action, children }: {
  tone: 'ok' | 'warn' | 'bad';

  action?: ReactNode;
  children: ReactNode;
}) {
  const mark = tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '×';
  return (
    <div className={`verdict verdict--${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <span className="verdict__mark" aria-hidden>{mark}</span>
      <span className="verdict__text">{children}</span>
      {action ? <span className="verdict__action">{action}</span> : null}
    </div>
  );
}

export function Fold({ title, count, summary, open, children, rename, actions }: {
  title: ReactNode;
  count?: number;
  summary?: ReactNode;
  open?: boolean;
  children: ReactNode;
  rename?: { value: string; placeholder?: string; onCommit: (next: string) => void };
  actions?: ReactNode;
}) {
  const [shown, setShown] = useState(Boolean(open));
  return (
    <details className="fold" open={open} onToggle={e => setShown((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="fold__head">
        {rename && shown ? (
          <span
            className="fold__title fold__title--edit"
            onClick={e => e.preventDefault()}
            onKeyUp={e => { if (e.key === ' ') e.preventDefault(); }}
          >
            <LabelInput value={rename.value} onCommit={rename.onCommit} {...(rename.placeholder ? { placeholder: rename.placeholder } : {})} />
          </span>
        ) : <span className="fold__title">{title}</span>}
        {summary ? <span className="summary">{summary}</span> : null}
        {count === undefined ? null : <span className="fold__count num">{count}</span>}
        {actions ? <span className="fold__actions" onClick={e => e.preventDefault()}>{actions}</span> : null}
      </summary>
      <div className="fold__body">{children}</div>
    </details>
  );
}

export const DRAWER_LEAVE_MS = 200;

export function Drawer({ open, title, sub, onClose, children, footer }: {
  open: boolean;
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(() => {
    setLeaving(gone => {
      if (gone) return gone;
      window.setTimeout(() => { setLeaving(false); onClose(); }, DRAWER_LEAVE_MS);
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') leave(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, leave]);

  if (!open) return null;

  return createPortal(
    <div className={`drawer${leaving ? ' drawer--leaving' : ''}`}>
      <div className="drawer__veil" onClick={leave} />
      <aside className="drawer__panel" role="dialog" aria-modal="true" aria-label={String(title)}>
        <header className="drawer__head">
          <div className="stack stack--tight">
            <span className="drawer__title">{title}</span>
            {sub ? <span className="faint">{sub}</span> : null}
          </div>
          <button type="button" className="drawer__x" aria-label="закрыть" onClick={leave}>×</button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__foot">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function Empty({ title, hint, action }: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {hint ? <div className="empty__hint">{hint}</div> : null}
      {action}
    </div>
  );
}
