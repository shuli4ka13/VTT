import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface Pane {

  head?: ReactNode;

  tools?: ReactNode;
  body: ReactNode;

  pinned?: boolean;
}

const FOLD_KEY = (side: string, head: ReactNode) => `vtt.fold.${side}.${typeof head === 'string' ? head : ''}`;

function useFold(side: 'left' | 'right', head: ReactNode) {
  const key = FOLD_KEY(side, head);
  const [folded, setFolded] = useState(() => {
    try { return localStorage.getItem(key) !== '0'; } catch { return true; }
  });
  const toggle = () => setFolded(was => {
    try { localStorage.setItem(key, was ? '0' : '1'); } catch { return !was; }
    return !was;
  });
  return [folded, toggle] as const;
}

export function Columns({ left, main, right }: { left?: Pane; main: { body: ReactNode }; right?: Pane }) {
  const [leftFolded, toggleLeft] = useFold('left', left?.head);
  const [rightFolded, toggleRight] = useFold('right', right?.head);
  const shape = left && right ? '' : left ? 'columns--left-only' : right ? 'columns--right-only' : 'columns--one';
  const folds = `${left && leftFolded && !left.pinned ? ' columns--l-folded' : ''}${right && rightFolded && !right.pinned ? ' columns--r-folded' : ''}`;

  return (
    <div className={`columns ${shape}${folds}`}>
      {left ? <Column kind="side" pane={left} folded={leftFolded && !left.pinned} onFold={toggleLeft} /> : null}
      <div className="column column--main">
        <div className="column__inner">{main.body}</div>
      </div>
      {right ? <Column kind="right" pane={right} folded={rightFolded && !right.pinned} onFold={toggleRight} /> : null}
    </div>
  );
}

function Column({ kind, pane, folded, onFold }: { kind: 'side' | 'right'; pane: Pane; folded: boolean; onFold: () => void }) {
  const title = typeof pane.head === 'string' ? pane.head : 'панель';
  const arrow = (kind === 'side') === folded ? '»' : '«';
  const fold = pane.pinned ? null : (
    <button type="button" className="column__fold" onClick={onFold}
      aria-label={folded ? `развернуть «${title}»` : `свернуть «${title}»`} title={folded ? 'развернуть' : 'свернуть'}>
      {arrow}
    </button>
  );
  if (folded) {
    return (
      <div className={`column column--${kind} column--folded`}>
        {fold}
        <span className="column__spine">{pane.head}</span>
      </div>
    );
  }
  return (
    <div className={`column column--${kind}`}>
      <ColumnHead head={pane.head ?? ''} tools={<>{pane.tools}{fold}</>} />
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

export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function ListItem({ icon, name, meta, active, fresh, onClick }: {
  icon?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  fresh?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`list__item${fresh ? ' list__item--fresh' : ''}`} aria-current={active} onClick={onClick}>
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

export interface RowsColumn { head: string; width: string; minor?: boolean }

export interface RowsLine {
  key: string;
  cells: ReactNode[];
  onOpen?: () => void;
  selected?: boolean;
}

export function RowsTable({ columns, rows }: { columns: RowsColumn[]; rows: RowsLine[] }) {
  const wide = columns.map(column => column.width).join(' ');
  const narrow = columns.filter(column => !column.minor).map(column => column.width).join(' ');
  const style = { '--rows-cols': wide, '--rows-cols-narrow': narrow } as CSSProperties;
  return (
    <div className="rows-table" role="table" style={style}>
      <div className="rows-table__head" role="row">
        {columns.map((column, index) => (
          <span key={index} role="columnheader" className={column.minor ? 'rows-table__minor' : undefined}>{column.head}</span>
        ))}
      </div>
      {rows.map(row => (
        <div key={row.key} role="row" className="rows-table__row" aria-current={row.selected ? 'true' : undefined}>
          {row.cells.map((cell, index) => (
            <div key={index} role="cell"
              className={`rows-table__cell${columns[index]?.minor ? ' rows-table__minor' : ''}${columns[index]?.head ? '' : ' rows-table__acts'}`}>
              {index === 0 && row.onOpen
                ? <button type="button" className="rows-table__open" onClick={row.onOpen}>{cell}</button>
                : cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
