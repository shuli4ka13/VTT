import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Sun, SunSpan } from '@vtt/engine';
import type { Effect, System } from '@vtt/schema';
import type { Placed } from '../layout.ts';
import type { Point, View } from '../viewport.ts';
import { canInsert, insertStep, moveAtomTo, moveVerdict, placeFor } from './ops.ts';
import type { Mode, Template } from './ops.ts';
import type { SunEdit } from './use-sun-edit.ts';

export const THRESHOLD = 6;
export const REACH = 20;

const TARGET_PARTS: ReadonlySet<string> = new Set(['steps', 'attach', 'detach', 'handler', 'handler-on', 'handler-if', 'handler-confirm']);

export const toLayer = (point: Point, rect: { left: number; top: number }, view: View): Point => ({
  x: (point.x - rect.left - view.x) / view.k,
  y: (point.y - rect.top - view.y) / view.k,
});

const eligible = (one: Placed): boolean => one.what === 'ray' && Boolean(one.ray?.span) && TARGET_PARTS.has(one.ray!.span!.part);

export function dropTarget(placed: readonly Placed[], point: Point, reach: number): Placed | null {
  const gap = (one: Placed): number => Math.hypot(point.x - one.x, point.y - one.y) - one.r;
  const rays = placed.filter(eligible);
  const over = rays.filter(one => gap(one) <= 0).sort((a, b) => gap(a) - gap(b))[0];
  if (over) return over;
  if (placed.some(one => gap(one) <= 0)) return null;
  const near = rays.filter(one => gap(one) <= reach).sort((a, b) => gap(a) - gap(b))[0];
  return near ?? null;
}

export type DragSource =
  | { kind: 'chip'; template: Template; label: string }
  | { kind: 'bubble'; id: string; span: SunSpan; label: string };

export interface DragState {
  source: DragSource;
  x: number;
  y: number;
  target: string | null;
  verdict: true | string | null;
}

export interface Geometry { node: RefObject<HTMLElement | null>; view: View }

export interface DragInput {
  geometry: RefObject<Geometry | null>;
  placed: readonly Placed[];
  sun: Sun | null;
  effect: Effect | undefined;
  system: System;
  effectId: string;
  mode: Mode;
  edit: SunEdit;
  onSelect: (key: string | null) => void;
}

interface Session {
  source: DragSource;
  from: Point;
  active: boolean;
  cancelled: boolean;
  node: Element | null;
  pointerId: number;
}

export interface Dragging {
  drag: DragState | null;
  begin: (source: DragSource, event: ReactPointerEvent<Element>) => void;
}

export function useSunDrag(input: DragInput): Dragging {
  const [drag, setDrag] = useState<DragState | null>(null);
  const live = useRef(input);
  live.current = input;
  const stop = useRef<(() => void) | null>(null);

  const judge = (source: DragSource, point: Point): { target: Placed | null; verdict: true | string | null } => {
    const now = live.current;
    const g = now.geometry.current;
    const node = g?.node.current;
    if (!g || !node || !now.effect || !now.sun) return { target: null, verdict: null };
    const layer = toLayer(point, node.getBoundingClientRect(), g.view);
    const target = dropTarget(now.placed, layer, REACH / g.view.k);
    if (!target) return { target: null, verdict: null };
    if (source.kind === 'chip') {
      const spot = placeFor(now.effect, now.sun, target.ray ?? null, now.mode, source.template);
      return { target, verdict: canInsert(now.effect, now.system, now.effectId, spot, source.template) };
    }
    return { target, verdict: moveVerdict(now.effect, source.span, target.ray?.span ?? null) };
  };

  const land = (source: DragSource, target: Placed): void => {
    const now = live.current;
    const effect = now.effect;
    const span = target.ray?.span;
    if (!effect || !span || !now.sun) return;
    let key: string | null = null;
    if (source.kind === 'chip') {
      const spot = placeFor(effect, now.sun, target.ray ?? null, now.mode, source.template);
      if (!spot) return;
      now.edit(draft => { key = insertStep(draft, now.system, now.effectId, spot, source.template); }, { typing: false });
    } else {
      now.edit(draft => { key = moveAtomTo(draft, now.system, now.effectId, source.span, span); }, { typing: false });
    }
    if (key) now.onSelect(key);
  };

  const begin = useCallback((source: DragSource, event: ReactPointerEvent<Element>): void => {
    if (event.button) return;
    stop.current?.();
    const session: Session = {
      source,
      from: { x: event.clientX, y: event.clientY },
      active: false,
      cancelled: false,
      node: event.currentTarget,
      pointerId: event.pointerId,
    };
    try { session.node?.setPointerCapture?.(event.pointerId); } catch { session.node = null; }

    const onMove = (move: PointerEvent): void => {
      if (session.cancelled) return;
      const point = { x: move.clientX, y: move.clientY };
      if (!session.active) {
        if (Math.hypot(point.x - session.from.x, point.y - session.from.y) < THRESHOLD) return;
        session.active = true;
      }
      const { target, verdict } = judge(source, point);
      setDrag({ source, x: point.x, y: point.y, target: target?.id ?? null, verdict });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      try { session.node?.releasePointerCapture?.(session.pointerId); } catch { session.node = null; }
      stop.current = null;
      setDrag(null);
    };

    const swallowClick = (): void => {
      const eat = (click: Event): void => { click.stopPropagation(); click.preventDefault(); };
      window.addEventListener('click', eat, true);
      setTimeout(() => window.removeEventListener('click', eat, true), 0);
    };

    const onUp = (up: PointerEvent): void => {
      const dragged = session.active || session.cancelled;
      const point = { x: up.clientX, y: up.clientY };
      const lands = session.active && !session.cancelled ? judge(source, point) : null;
      finish();
      if (dragged) swallowClick();
      if (lands && lands.target && lands.verdict === true) land(source, lands.target);
    };

    const onCancel = (): void => { finish(); };

    const onKey = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      session.cancelled = true;
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    stop.current = finish;
  }, []);

  useEffect(() => () => { stop.current?.(); }, []);

  return { drag, begin };
}
