import { useEffect, useRef, useState } from 'react';

const nextFrame = (run: () => void): number =>
  (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : window.setTimeout(run, 50));

const dropFrame = (frame: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); else window.clearTimeout(frame);
};

export interface Box { top: number; left: number; width: number; height: number }

export function Spot({ target, place, onBox }: { target: () => HTMLElement | null; place: string; onBox?: (box: Box | null) => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const tell = useRef(onBox);
  tell.current = onBox;

  useEffect(() => { tell.current?.(box); }, [box]);
  const scrolled = useRef<{ place: string; el: HTMLElement } | null>(null);
  const find = useRef(target);
  find.current = target;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = find.current();
      if (el && (scrolled.current?.place !== place || scrolled.current.el !== el)) {
        scrolled.current = { place, el };
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      const rect = el?.getBoundingClientRect();
      const next = rect && (rect.width || rect.height)
        ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        : null;
      setBox(was => (was?.top === next?.top && was?.left === next?.left && was?.width === next?.width && was?.height === next?.height ? was : next));
      frame = nextFrame(tick);
    };
    frame = nextFrame(tick);
    return () => dropFrame(frame);
  }, [place]);

  if (!box) return null;
  return (
    <div className="guide-spot" aria-hidden
      style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }} />
  );
}
