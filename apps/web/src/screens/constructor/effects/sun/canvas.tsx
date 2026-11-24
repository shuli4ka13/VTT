import type { KeyboardEvent, ReactElement } from 'react';
import type { Sun } from '@vtt/engine';
import { useT } from '../../../../i18n/author.ts';
import { Bubble } from './bubble.tsx';
import type { Placed, SunLayout } from './layout.ts';
import { percent, useViewport } from './viewport.ts';

export interface CanvasProps {
  sun: Sun;
  layout: SunLayout;
  selectedId: string | null;
  description?: string;
  onPick: (placed: Placed) => void;
  onEscape: () => void;
}

export function neighbour(layout: SunLayout, fromId: string, key: string): string | null {
  const placed = layout.placed;
  const here = placed.find(one => one.id === fromId);
  if (!here) return null;
  const rays = placed.filter(one => one.what === 'ray');
  if (here.what === 'center') {
    if (key === 'ArrowRight' || key === 'ArrowDown') return rays[0]?.id ?? null;
    return null;
  }
  const at = rays.findIndex(one => one.ray === here.ray && one.what === 'ray');
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    if (!rays.length) return null;
    const step = key === 'ArrowRight' ? 1 : -1;
    return rays[(at + step + rays.length) % rays.length]!.id;
  }
  const chain = placed.filter(one => one.ray === here.ray);
  const index = chain.findIndex(one => one.id === fromId);
  if (key === 'ArrowDown') return chain[index + 1]?.id ?? null;
  if (key === 'ArrowUp') return index > 0 ? chain[index - 1]!.id : 'center';
  return null;
}

export function Canvas({ sun, layout, selectedId, description, onPick, onEscape }: CanvasProps): ReactElement {
  const t = useT('sun');
  const port = useViewport(layout, sun.effect);
  const { view } = port;
  const repeats = sun.rays.some(ray => ray.repeat);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { onEscape(); return; }
    if (!event.key.startsWith('Arrow')) return;
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-bubble]')?.dataset.bubble;
    if (!from) return;
    const next = neighbour(layout, from, event.key);
    if (!next) return;
    const node = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-bubble]')].find(one => one.dataset.bubble === next);
    if (!node) return;
    event.preventDefault();
    node.focus();
  };

  return (
    <div className="sun-stage">
      <div
        ref={port.ref}
        className="sun-canvas"
        role="group"
        aria-label={t('canvas.label')}
        style={{ backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onKeyDown={onKeyDown}
        {...port.grab}
      >
        <div className="sun-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {layout.placed.map(one => (
            <Bubble key={one.id} placed={one} sun={sun} selected={one.id === selectedId} onPick={onPick} />
          ))}
        </div>
      </div>

      <div className="sun-zoom">
        <button type="button" className="btn btn--sm" aria-label={t('canvas.zoomOut')} title={t('canvas.zoomOut')} onClick={port.zoomOut}>−</button>
        <button type="button" className="btn btn--sm" title={t('canvas.zoomReset', { percent: percent(view.k) })} onClick={port.reset}>{percent(view.k)}%</button>
        <button type="button" className="btn btn--sm" aria-label={t('canvas.zoomIn')} title={t('canvas.zoomIn')} onClick={port.zoomIn}>+</button>
        <button type="button" className="btn btn--sm" title={t('canvas.fitTitle')} onClick={port.fit}>{t('canvas.fit')}</button>
      </div>

      {sun.rays.length === 0 ? <p className="sun-empty">{t('canvas.empty')}</p> : null}

      {description ? (
        <div className="sun-says">
          <span className="sun-says__head">{t('canvas.says')}</span>
          <p>{description}</p>
        </div>
      ) : null}

      {repeats ? <span className="sun-legend-note"><span className="sun-legend-note__ring" aria-hidden />{t('canvas.repeat')}</span> : null}
    </div>
  );
}
