import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export interface View { x: number; y: number; k: number }

export interface Bounds { left: number; top: number; right: number; bottom: number }

export interface Size { w: number; h: number }

export interface Point { x: number; y: number }

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2;
export const PAD = 36;
const WHEEL_RATE = 0.0015;
const STEP = 1.25;

export const clampScale = (k: number): number => (Number.isFinite(k) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, k)) : 1);

export function fitView(bounds: Bounds, size: Size, pad = PAD): View {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  if (!(size.w > 0) || !(size.h > 0)) return { x: size.w / 2 - cx, y: size.h / 2 - cy, k: 1 };
  const k = clampScale(Math.min((size.w - pad * 2) / width, (size.h - pad * 2) / height, 1));
  return { x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k };
}

export const READABLE = 0.7;

export function startView(bounds: Bounds, size: Size, pad = PAD): View {
  const fit = fitView(bounds, size, pad);
  if (fit.k >= READABLE || !(size.w > 0) || !(size.h > 0)) return fit;
  return { x: size.w / 2, y: size.h / 2, k: READABLE };
}

export function zoomAt(view: View, next: number, at: Point): View {
  const k = clampScale(next);
  const ratio = k / view.k;
  return { x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio, k };
}

export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x + dx, y: view.y + dy });

export const wheelScale = (k: number, deltaY: number): number => clampScale(k * Math.exp(-deltaY * WHEEL_RATE));

export const stepScale = (k: number, direction: 1 | -1): number => clampScale(direction > 0 ? k * STEP : k / STEP);

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const percent = (k: number): number => Math.round(k * 100);

export interface ViewportApi {
  ref: RefObject<HTMLDivElement | null>;
  view: View;
  fit: () => void;
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  grab: { onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void; onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void };
}

export function useViewport(bounds: Bounds, fitKey: string): ViewportApi {
  const ref = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ from: number; k: number } | null>(null);

  const sizeOf = useCallback((): Size => {
    const node = ref.current;
    return { w: node?.clientWidth ?? 0, h: node?.clientHeight ?? 0 };
  }, []);

  const put = useCallback((next: View) => { viewRef.current = next; setView(next); }, []);

  const fit = useCallback(() => put(fitView(boundsRef.current, sizeOf())), [put, sizeOf]);
  const start = useCallback(() => put(startView(boundsRef.current, sizeOf())), [put, sizeOf]);

  const around = useCallback((next: number) => {
    const size = sizeOf();
    put(zoomAt(viewRef.current, next, { x: size.w / 2, y: size.h / 2 }));
  }, [put, sizeOf]);

  useLayoutEffect(() => { start(); }, [start, fitKey]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    let first = true;
    const watch = new ResizeObserver(() => { if (first) { first = false; start(); } });
    watch.observe(node);
    return () => watch.disconnect();
  }, [start, fitKey]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        put(zoomAt(viewRef.current, wheelScale(viewRef.current.k, event.deltaY), at));
      } else {
        put(panBy(viewRef.current, -event.deltaX, -event.deltaY));
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [put]);

  const local = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const grab: ViewportApi['grab'] = {
    onPointerDown: event => {
      if ((event.target as Element).closest('[data-bubble]')) return;
      pointers.current.set(event.pointerId, local(event));
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { pointers.current.set(event.pointerId, local(event)); }
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        gesture.current = { from: Math.max(1, distance(a, b)), k: viewRef.current.k };
      }
    },
    onPointerMove: event => {
      const before = pointers.current.get(event.pointerId);
      if (!before) return;
      const now = local(event);
      pointers.current.set(event.pointerId, now);
      if (pointers.current.size >= 2 && gesture.current) {
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        put(zoomAt(viewRef.current, gesture.current.k * (distance(a, b) / gesture.current.from), middle(a, b)));
        return;
      }
      put(panBy(viewRef.current, now.x - before.x, now.y - before.y));
    },
    onPointerUp: event => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) gesture.current = null;
      try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { gesture.current = null; }
    },
    onPointerCancel: event => {
      pointers.current.delete(event.pointerId);
      gesture.current = null;
    },
  };

  return {
    ref, view, fit, grab,
    reset: () => around(1),
    zoomIn: () => around(stepScale(viewRef.current.k, 1)),
    zoomOut: () => around(stepScale(viewRef.current.k, -1)),
  };
}
