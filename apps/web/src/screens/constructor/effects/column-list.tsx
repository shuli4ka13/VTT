import type { ReactNode } from 'react';
import { Button } from '../../../ui/primitives.tsx';
import { useDragList } from '../../../ui/drag-list.ts';

export function ColumnList<T extends { key: string; label?: string }>({ items, isOpen, onToggle, summary, form, onDrop, onMove, dropTitle }: {
  items: T[];
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  summary: (item: T) => ReactNode;
  form: (item: T) => ReactNode;
  onDrop: (key: string) => void;
  onMove: (from: string, to: string, after: boolean) => void;
  dropTitle: string;
}) {
  const drag = useDragList(onMove);
  return (
    <div className="param-list">
      {items.map(item => {
        const open = isOpen(item.key);
        return (
          <div key={item.key} className="param-item">
            <div className={`param-line${drag.mark(item.key)}`} {...(items.length > 1 ? drag.props(item.key) : {})}>
              {items.length > 1 ? <span className="drag-grip" aria-hidden title="перетащите, чтобы поменять порядок">⋮⋮</span> : null}
              <button type="button" className="param-line__sum" aria-expanded={open} onClick={() => onToggle(item.key)}>
                <span className="param-line__name">{item.label || item.key}</span>
                <span className="faint">{summary(item)}</span>
              </button>
              <Button size="sm" variant="ghost" title={dropTitle} onClick={() => onDrop(item.key)}>×</Button>
            </div>
            {open ? form(item) : null}
          </div>
        );
      })}
    </div>
  );
}
