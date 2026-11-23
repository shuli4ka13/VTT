import { render, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { i18n, UI_LANGS } from '../i18n/index.ts';

const closedFolds = (): string => {
  const prefixes = UI_LANGS.map(lang => i18n.getFixedT(lang)('common:fold.expand', { name: '\u0000' }).split('\u0000')[0]!);
  return [...prefixes.map(prefix => `[aria-label^="${prefix.replace(/"/g, '\\"')}"]`), '.step-fold[aria-expanded="false"]'].join(', ');
};

export function openAll(): void {
  for (let pass = 0; pass < 4; pass++) {
    const closed = [...document.querySelectorAll<HTMLElement>(closedFolds())];
    if (!closed.length) return;
    closed.forEach(button => fireEvent.click(button));
  }
}

export function renderOpen(ui: ReactElement): ReturnType<typeof render> {
  const out = render(ui);
  openAll();
  return out;
}
