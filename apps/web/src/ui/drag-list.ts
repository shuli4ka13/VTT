import { useState } from 'react';
import type { DragEvent } from 'react';

export interface DragProps {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function useDragList(onMove: (from: string, to: string, after: boolean) => void, axis: 'x' | 'y' = 'y') {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null);
  const reset = () => { setDragging(null); setOver(null); };
  const props = (key: string): DragProps => ({
    draggable: true,
    onDragStart: event => {
      event.stopPropagation();
      event.dataTransfer.setData('text/plain', key);
      event.dataTransfer.effectAllowed = 'move';
      setDragging(key);
    },
    onDragOver: event => {
      if (!dragging || dragging === key) return;
      event.preventDefault();
      event.stopPropagation();
      const box = event.currentTarget.getBoundingClientRect();
      const after = axis === 'y' ? event.clientY > box.top + box.height / 2 : event.clientX > box.left + box.width / 2;
      setOver(now => (now?.key === key && now.after === after ? now : { key, after }));
    },
    onDragLeave: () => setOver(now => (now?.key === key ? null : now)),
    onDrop: event => {
      event.preventDefault();
      event.stopPropagation();
      if (dragging && dragging !== key) onMove(dragging, key, over?.key === key ? over.after : false);
      reset();
    },
    onDragEnd: reset,
  });
  const mark = (key: string): string =>
    dragging === key ? ' drag--dragging' : over?.key === key ? (over.after ? ' drag--after' : ' drag--before') : '';
  return { props, mark };
}
