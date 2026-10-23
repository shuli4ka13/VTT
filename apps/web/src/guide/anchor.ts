import type { Anchor } from './types.ts';
import { same } from './find.ts';

const NAMED = [
  'button', '[role="tab"]', '[role="button"]', 'a', 'label', 'summary', 'select',
  '.field__label', '.list__name', '.fold__title', '.block-fold__name', '.card__title', '.param-line__name',
].join(', ');

const CLICKABLE = 'button, [role="button"], [role="tab"], a, summary, select, label';

const textOf = (el: Element): string => {
  if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.text ?? '';
  return (el.textContent ?? '').replace(/\s+/g, ' ');
};

export function shown(el: Element): boolean {
  if (el.closest('[hidden], .guide')) return false;
  for (let at: Element | null = el.parentElement; at; at = at.parentElement) {
    if (at instanceof HTMLDetailsElement && !at.open) {
      const summary = at.querySelector(':scope > summary');
      if (!summary || !summary.contains(el)) return false;
    }
  }
  return true;
}

function homes(name: string, root: ParentNode): Element[] {
  const out = new Set<Element>();
  for (const el of root.querySelectorAll('[aria-label]')) if (same(el.getAttribute('aria-label'), name)) out.add(el);
  for (const head of root.querySelectorAll('.column__head > span:first-child, .column__spine')) {
    if (same(textOf(head), name)) { const column = head.closest('.column'); if (column) out.add(column); }
  }
  for (const title of root.querySelectorAll('.card__title')) {
    if (same(textOf(title), name)) { const card = title.closest('.card'); if (card) out.add(card); }
  }
  return [...out].filter(shown);
}

export function findAnchor(anchor: Anchor | undefined, root: ParentNode = document): HTMLElement | null {
  if (!anchor) return null;
  if ('field' in anchor) {
    return [...root.querySelectorAll<HTMLElement>('[data-field]')].find(el => el.dataset.field === anchor.field && shown(el)) ?? null;
  }
  if ('guide' in anchor) {
    return [...root.querySelectorAll<HTMLElement>('[data-guide]')].find(el => el.dataset.guide === anchor.guide && shown(el)) ?? null;
  }
  const places = anchor.in ? homes(anchor.in, root) : [root];
  for (const place of places) {
    const found = [...place.querySelectorAll<HTMLElement>(NAMED)].find(el => shown(el) && same(textOf(el), anchor.text));
    if (found) return (found.closest<HTMLElement>(CLICKABLE) ?? found);
  }
  return null;
}

export const firstOf = (anchors: Anchor | Anchor[] | undefined, root: ParentNode = document): HTMLElement | null => {
  for (const anchor of anchors === undefined ? [] : Array.isArray(anchors) ? anchors : [anchors]) {
    const found = findAnchor(anchor, root);
    if (found) return found;
  }
  return null;
};

export const foldOf = (panel: string, root: ParentNode = document): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>('[aria-label^="развернуть «"]')].find(el => el.getAttribute('aria-label') === `развернуть «${panel}»`) ?? null;

export const openedDialog = (name: string, root: ParentNode = document): boolean =>
  [...root.querySelectorAll('[role="dialog"]')].some(el => same(el.getAttribute('aria-label'), name));
