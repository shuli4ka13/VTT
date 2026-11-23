import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n/index.ts';

export interface GridColumn {
  key: string;
  label: string;
  width: number;
  hint?: string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}

const MIN_WIDTH = 60;

function useWidths(id: string) {
  const key = `vtt.grid-widths.${id}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>; } catch { return {}; }
  });
  const set = (column: string, width: number) => setWidths(all => {
    const next = { ...all, [column]: Math.max(MIN_WIDTH, Math.round(width)) };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { return next; }
    return next;
  });
  return [widths, set] as const;
}

function HeadCell({ column, width, onResize }: { column: GridColumn; width: number; onResize: (width: number) => void }) {
  const t = useT('ui');
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = e.clientX;
    const move = (ev: PointerEvent) => onResize(width + ev.clientX - start);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`sheet-grid__head${column.active ? ' sheet-grid__head--active' : ''}`} title={column.hint ?? column.label}>
      {column.onClick ? (
        <button type="button" className="sheet-grid__title sheet-grid__title--button" onClick={column.onClick}>
          {column.label}{column.sub ? <span className="sheet-grid__sub">{column.sub}</span> : null}
        </button>
      ) : <span className="sheet-grid__title">{column.label}</span>}
      <span className="sheet-grid__grip" role="separator" aria-label={t('grid.resize', { name: column.label })} onPointerDown={drag} />
    </div>
  );
}

export function SheetGrid({ id, columns, tail = 40, tailHead, children }: {
  id: string;
  columns: GridColumn[];
  tail?: number | null;
  tailHead?: ReactNode;
  children: ReactNode;
}) {
  const [widths, setWidth] = useWidths(id);
  const widthOf = (column: GridColumn) => widths[column.key] ?? column.width;
  const template = [...columns.map(c => `${widthOf(c)}px`), ...(tail ? [`${tail}px`] : [])].join(' ');
  return (
    <div className="sheet-scroll">
      <div className="sheet-grid" style={{ gridTemplateColumns: template }}>
        {columns.map(c => <HeadCell key={c.key} column={c} width={widthOf(c)} onResize={w => setWidth(c.key, w)} />)}
        {tail ? <span className="sheet-grid__head">{tailHead}</span> : null}
        {children}
      </div>
    </div>
  );
}
