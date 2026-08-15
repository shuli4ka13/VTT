// Компоненты-кирпичи. Тонкие обёртки над классами из primitives.css:
// сами по себе они почти ничего не делают, и это правильно — их работа
// в том, чтобы форма карточки была ОДНА на всё приложение, а не сочинялась
// заново на каждом экране.

import { useState } from 'react';
import type { ReactNode, ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

export function Card({ children, tone, className = '' }: {
  children: ReactNode;
  tone?: 'bad' | 'flat';
  className?: string;
}) {
  return <div className={`card ${tone ? `card--${tone}` : ''} ${className}`}>{children}</div>;
}

/**
 * Шапка карточки. `sub` — одна строка человеческими словами о том, ЧТО это
 * и зачем: заголовок вроде «Правки броска» ничего не объясняет тому, кто
 * видит его впервые, а «Преимущество, помеха и всё, что меняет бросок» —
 * объясняет. Строка короткая и всегда на виду: подсказка, спрятанная под
 * знак вопроса, не помогает тому, кто не знает, что спросить.
 */
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

export function Input({ value, onChange, placeholder, mono, invalid, type = 'text', onBlur, onKeyDown }: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  type?: string;
  /**
   * Для полей с черновиком (набор коммитится по уходу/Enter, а не на каждый
   * символ — тот же приём, что RollExprInput в card.tsx и SlotInput):
   * onChange здесь пишет только в локальный черновик компонента-обёртки.
   */
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      className={`input ${mono ? 'input--mono' : ''} ${invalid ? 'input--bad' : ''}`}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Число с черновиком. Управляемый инпут без черновика затирает пустоту
 * сохранённым значением на каждой букве: цифру нельзя стереть, минус
 * нельзя начать. Здесь недописанное живёт, пока набирают; валидное число
 * уходит в данные сразу; ушёл фокус — поле показывает сохранённое.
 */
export function NumInput({ value, onCommit, int, least, mono, placeholder }: {
  value: number;
  onCommit: (n: number) => void;
  /** Только целые. */
  int?: boolean;
  /** Не меньше этого — недобор не коммитится (грани кости ⩾ 2). */
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


/**
 * Кнопка, которая не срабатывает с первого раза. Удаление заполненной
 * карточки, эффекта или рода — работа получаса, и ей нельзя умирать
 * от промаха мышью. Не окно подтверждения: взвод и отмена живут на месте
 * кнопки, ничего не перекрывая и не требуя целиться в модалку.
 */
export function DangerButton({ children, onConfirm, size, title }: {
  children: ReactNode;
  onConfirm: () => void;
  size?: 'sm';
  title?: string;
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
    <>
      <Button size={size} variant="danger" onClick={onConfirm}>точно убрать</Button>
      <Button size={size} variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </>
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
export function Verdict({ tone, action, children }: {
  tone: 'ok' | 'warn' | 'bad';
  /** Лекарство рядом с диагнозом — внутри того же блока, не отдельной карточкой. */
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
