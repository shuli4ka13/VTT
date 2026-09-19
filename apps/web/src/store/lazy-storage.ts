import type { StateStorage } from 'zustand/middleware';

const PAUSE = 500;

export function lazyStorage(base: () => Storage): StateStorage & { flush(): void } {
  const waiting = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null; }
    for (const [key, value] of waiting) base().setItem(key, value);
    waiting.clear();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    getItem: key => waiting.get(key) ?? base().getItem(key),
    setItem: (key, value) => {
      waiting.set(key, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PAUSE);
    },
    removeItem: key => {
      waiting.delete(key);
      base().removeItem(key);
    },
    flush,
  };
}
