// Компоненты-кирпичи. Тонкие обёртки над классами из primitives.css:
// сами по себе они почти ничего не делают, и это правильно — их работа
// в том, чтобы форма карточки была ОДНА на всё приложение, а не сочинялась
// заново на каждом экране.

import type { ReactNode, ChangeEvent } from 'react';

export function Card({ children, tone, className = '' }: {
  children: ReactNode;
  tone?: 'bad' | 'flat';
  className?: string;
}) {
  return <div className={`card ${tone ? `card--${tone}` : ''} ${className}`}>{children}</div>;
}

export function CardHead({ title, badge, actions }: {
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card__head">
      <h3 className="card__title">{title}{badge}</h3>
      {actions ? <div className="inline inline--tight">{actions}</div> : null}
    </div>
  );
}

/**
 * Строка формы. `needed` — не «пусто», а «сюда надо вписать»: слот подсвечен
 * жёлтым и подпись тоже. Разница смысловая: пустое поле выглядит нормальным,
 * а незаполненное обязательное должно выглядеть незаконченным.
 */
export function Field({ label, hint, error, needed, children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  needed?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field ${needed ? 'field--needed' : ''}`}>
      <span className="field__label">{label}{needed ? <span aria-hidden>·заполнить</span> : null}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
}

export function Input({ value, onChange, placeholder, mono, invalid, type = 'text' }: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  type?: string;
}) {
  return (
    <input
      className={`input ${mono ? 'input--mono' : ''} ${invalid ? 'input--bad' : ''}`}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <select className="select" value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

export function Button({ children, onClick, variant, size, wide, disabled, title }: {
  children: ReactNode;
  onClick?: () => void;
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
    <button type="button" className={classes.join(' ')} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/** Выбор из трёх-четырёх взаимоисключающих вариантов. Занимает одну строку. */
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
    <span className={classes.join(' ')} title={title} onClick={onClick}>
      <span className="nowrap">{children}</span>
      {onRemove ? (
        <button type="button" className="chip__x" aria-label="убрать" onClick={e => { e.stopPropagation(); onRemove(); }}>
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * Приговор о разборе. Показывается ТАМ, где виноват, а не только сверху:
 * красная строка в шапке экрана не помогает найти, какая из карточек сломана.
 */
export function Verdict({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const mark = tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '×';
  return (
    <div className={`verdict verdict--${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <span className="verdict__mark" aria-hidden>{mark}</span>
      <span className="verdict__text">{children}</span>
    </div>
  );
}

/** Сворачиваемая секция на нативном <details>: ноль JS и клавиатура даром. */
export function Fold({ title, count, summary, open, children }: {
  title: ReactNode;
  count?: number;
  summary?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="fold" open={open}>
      <summary className="fold__head">
        <span className="fold__title">{title}</span>
        {summary ? <span className="summary">{summary}</span> : null}
        {count === undefined ? null : <span className="fold__count num">{count}</span>}
      </summary>
      <div className="fold__body">{children}</div>
    </details>
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
