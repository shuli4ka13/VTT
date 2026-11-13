import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const WINDOW_MS = 600;
let until = 0;
let wanted: string | undefined;

export const focusNew = (placeholder?: string): void => {
  until = Date.now() + WINDOW_MS;
  wanted = placeholder;
};

export function useFocusNew(ref: RefObject<HTMLInputElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || Date.now() > until) return;
    if (wanted !== undefined && el.getAttribute('placeholder') !== wanted) return;
    until = 0;
    el.focus();
    el.select();
  }, [ref]);
}
