import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import type { System } from '@vtt/schema';
import { cellsOf, pageOfBlock, pagesOf, GRID, HEIGHT_STEP } from '@vtt/engine/model/pages';
import type { Place } from '@vtt/engine/model/pages';
import { widthWords } from '@vtt/engine/words/glossary';

export interface GridEdit {
  onPlace: (name: string, target: string, where: Place) => void;
  onWidth: (name: string, width: number) => void;
  onHeight: (name: string, height: number | undefined) => void;
}

export function SheetGrid({ system, page, names, render, edit }: {
  system: System;
  page: string | undefined;
  names: readonly string[];
  render: (name: string) => ReactNode;
  edit?: GridEdit | undefined;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ name: string; where: Place } | null>(null);
  const [sizing, setSizing] = useState<{ head: string; width: number } | null>(null);
  const [lifting, setLifting] = useState<{ name: string; height: number } | null>(null);
  const shown = new Set(names);
  const blocks = system.blocks ?? [];
  const placed = new Set<string>();
  const cells = cellsOf(system, page).map(cell => {
    const members = cell.blocks;
    members.forEach(name => placed.add(name));
    return { head: cell.blocks[0]!, width: cell.width, names: members.filter(name => shown.has(name)) };
  }).filter(cell => cell.names.length);
  const loose = names.filter(name => !placed.has(name) && (!pagesOf(system).length || page === undefined || pageOfBlock(system, name) === page));
  const all = [...cells, ...loose.map(name => ({ head: name, width: GRID, names: [name] }))];

  const zoneAt = (x: number, y: number, self: string): { name: string; where: Place } | null => {
    const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
    const name = slot?.dataset.slot;
    if (!slot || !name || name === self || !grid.current?.contains(slot)) return null;
    const box = slot.getBoundingClientRect();
    const where: Place = y > box.top + box.height * 0.7 ? 'under' : x < box.left + box.width / 2 ? 'before' : 'after';
    return { name, where };
  };

  const move = (name: string) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!edit) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let spot: { name: string; where: Place } | null = null;
    setDragging(name);
    const step = (next: PointerEvent) => {
      spot = zoneAt(next.clientX, next.clientY, name);
      setOver(spot);
    };
    const up = () => {
      target.removeEventListener('pointermove', step);
      target.removeEventListener('pointerup', up);
      setDragging(null);
      setOver(null);
      if (spot) edit.onPlace(name, spot.name, spot.where);
    };
    target.addEventListener('pointermove', step);
    target.addEventListener('pointerup', up);
  };

  const resize = (head: string, width: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!edit || !grid.current) return;
    event.preventDefault();
    const unit = grid.current.clientWidth / GRID;
    const start = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let now = width;
    const move = (next: PointerEvent) => {
      now = Math.min(GRID, Math.max(1, width + Math.round((next.clientX - start) / unit)));
      setSizing({ head, width: now });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setSizing(null);
      if (now !== width) edit.onWidth(head, now);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    setSizing({ head, width });
  };

  const stretch = (name: string) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!edit) return;
    event.preventDefault();
    const slot = event.currentTarget.parentElement!;
    const startHeight = slot.getBoundingClientRect().height;
    const start = event.clientY;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let now = startHeight;
    const step = (next: PointerEvent) => {
      now = Math.max(40, Math.round((startHeight + next.clientY - start) / HEIGHT_STEP) * HEIGHT_STEP);
      setLifting({ name, height: now });
    };
    const up = () => {
      target.removeEventListener('pointermove', step);
      target.removeEventListener('pointerup', up);
      setLifting(null);
      if (Math.abs(now - startHeight) >= HEIGHT_STEP / 2) edit.onHeight(name, now);
    };
    target.addEventListener('pointermove', step);
    target.addEventListener('pointerup', up);
  };

  return (
    <div ref={grid} className={`sheet-layout${edit ? ' sheet-layout--edit' : ''}`}>
      {all.map(cell => {
        const width = sizing?.head === cell.head ? sizing.width : cell.width;
        return (
          <div key={cell.head} className="sheet-cell" style={{ '--w': width } as CSSProperties}>
            {cell.names.map(name => {
              const own = blocks.find(block => block.name === name)?.height;
              const height = lifting?.name === name ? lifting.height : own;
              return (
              <div key={name}
                className={`sheet-slot${height ? ' sheet-slot--sized' : ''}${over?.name === name ? ` sheet-slot--${over.where}` : ''}${dragging === name ? ' sheet-slot--dragging' : ''}`}
                {...(height ? { style: { '--h': `${height}px` } as CSSProperties } : {})}
                data-slot={name}>
                {edit ? (
                  <span className="sheet-grip" title="потяните блок: на левую или правую половину другого — встанет рядом, на его нижний край — под него"
                    onPointerDown={move(name)}>⋮⋮</span>
                ) : null}
                {render(name)}
                {edit ? (
                  <span className="sheet-hresize" title="потяните, чтобы сделать выше или ниже; двойной щелчок — по содержимому"
                    onPointerDown={stretch(name)} onDoubleClick={() => edit.onHeight(name, undefined)}>
                    {lifting?.name === name ? <span className="sheet-resize__label">{`${lifting.height} точек`}</span> : null}
                  </span>
                ) : null}
              </div>
              );
            })}
            {edit ? (
              <span className="sheet-resize" title="потяните, чтобы сделать шире или уже" onPointerDown={resize(cell.head, cell.width)}>
                {sizing?.head === cell.head ? <span className="sheet-resize__label">{widthWords(width)}</span> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
