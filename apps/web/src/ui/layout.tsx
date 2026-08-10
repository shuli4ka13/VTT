// Каркас экрана как ДАННЫЕ: экран не рисует колонки, а объявляет, что в них
// лежит. Отсюда — возможность переставлять и складывать секции, не трогая
// логику; в PoC состав колонок был захардкожен в каждом режиме, и любая
// перестановка означала правку кода экрана.

import type { ReactNode } from 'react';

export interface Pane {
  /** Заголовок колонки. Пустой — колонка без шапки (так живёт центр). */
  head?: ReactNode;
  /** Кнопка или переключатель справа в шапке колонки. */
  tools?: ReactNode;
  body: ReactNode;
}

export function Columns({ left, main, right }: { left?: Pane; main: Pane; right?: Pane }) {
  const shape = left && right ? '' : left || right ? 'columns--two' : 'columns--one';

  return (
    <div className={`columns ${shape}`}>
      {left ? <Column kind="side" pane={left} /> : null}
      <div className="column column--main">
        <div className="column__inner">
          {main.head ? <ColumnHead head={main.head} tools={main.tools} /> : null}
          {main.body}
        </div>
      </div>
      {right ? <Column kind="right" pane={right} /> : null}
    </div>
  );
}

function Column({ kind, pane }: { kind: 'side' | 'right'; pane: Pane }) {
  return (
    <div className={`column column--${kind}`}>
      {pane.head ? <ColumnHead head={pane.head} tools={pane.tools} /> : null}
      {pane.body}
    </div>
  );
}

function ColumnHead({ head, tools }: { head: ReactNode; tools?: ReactNode }) {
  return (
    <div className="column__head">
      <span>{head}</span>
      <span className="spacer" />
      {tools}
    </div>
  );
}

/** Список слева. Один на все экраны: систему, записи и чарники выбирают одинаково. */
export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function ListItem({ icon, name, meta, active, onClick }: {
  icon?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="list__item" aria-current={active} onClick={onClick}>
      {icon ? <span className="list__icon" aria-hidden>{icon}</span> : null}
      <span className="list__body">
        <span className="list__name">{name}</span>
        {meta ? <span className="list__meta">{meta}</span> : null}
      </span>
    </button>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <div className="list__group">{children}</div>;
}

export function Tabs<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { key: T; label: string; icon?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map(option => (
        <button
          key={option.key}
          type="button"
          role="tab"
          className="tabs__item"
          aria-selected={option.key === value}
          onClick={() => onChange(option.key)}
        >
          {option.icon ? <span aria-hidden>{option.icon} </span> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}
