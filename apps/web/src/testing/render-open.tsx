import { render, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';

const CLOSED = '[aria-label^="развернуть «"], .step-fold[aria-expanded="false"]';

export function openAll(): void {
  for (let pass = 0; pass < 4; pass++) {
    const closed = [...document.querySelectorAll<HTMLElement>(CLOSED)];
    if (!closed.length) return;
    closed.forEach(button => fireEvent.click(button));
  }
}

export function renderOpen(ui: ReactElement): ReturnType<typeof render> {
  const out = render(ui);
  openAll();
  return out;
}
