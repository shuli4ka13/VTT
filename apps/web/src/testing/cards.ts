import { fireEvent, act } from '@testing-library/react';
import { openAll } from './render-open.tsx';

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

export function within(root: ParentNode = document) {
  const buttons = () => [...root.querySelectorAll<HTMLElement>('button, [role="button"]')];

  const button = (text: string | RegExp): HTMLElement => {
    const found = buttons().find(b => (typeof text === 'string' ? textOf(b) === text : text.test(textOf(b))));
    if (!found) throw new Error(`нет кнопки «${String(text)}»; есть: ${buttons().map(textOf).filter(Boolean).slice(-60).join(' | ')}`);
    return found;
  };

  const has = (text: string | RegExp): boolean => buttons().some(b => (typeof text === 'string' ? textOf(b) === text : text.test(textOf(b))));

  const click = (text: string | RegExp): void => { act(() => { fireEvent.click(button(text)); }); openAll(); };

  const cell = (label: string, row = 0): HTMLElement => {
    for (const grid of root.querySelectorAll<HTMLElement>('.sheet-grid')) {
      const children = [...grid.children] as HTMLElement[];
      const heads = children.filter(c => c.classList.contains('sheet-grid__head'));
      const at = heads.findIndex(h => textOf(h.querySelector('.sheet-grid__title') ?? h) === label);
      if (at < 0) continue;
      const found = children[heads.length * (row + 1) + at];
      if (found) return found;
    }
    throw new Error(`нет клетки «${label}» в строке ${row}`);
  };

  const field = (label: string): HTMLElement => {
    const heads = [...root.querySelectorAll<HTMLElement>('.field__label')];
    const head = heads.find(h => textOf(h) === label || textOf(h).startsWith(`${label}·`));
    if (head) return head.closest('.field') as HTMLElement;
    try { return cell(label); } catch {
      const titles = [...root.querySelectorAll<HTMLElement>('.field__label, .sheet-grid__title')].map(textOf);
      throw new Error(`нет поля «${label}»; есть: ${titles.join(' | ')}`);
    }
  };

  const select = (label: string | HTMLElement, option: string): void => {
    const box = typeof label === 'string' ? field(label) : label;
    const el = box instanceof HTMLSelectElement ? box : box.querySelector('select');
    if (!el) throw new Error(`в «${String(label)}» нет списка`);
    const found = [...el.options].find(o => o.value === option || textOf(o) === option);
    if (!found) throw new Error(`в списке «${String(label)}» нет «${option}»; есть: ${[...el.options].map(o => `${o.value}=${textOf(o)}`).join(' | ')}`);
    act(() => { fireEvent.change(el, { target: { value: found.value } }); });
    openAll();
  };

  const type = (label: string | HTMLElement, text: string): void => {
    const box = typeof label === 'string' ? field(label) : label;
    const input = (box instanceof HTMLInputElement ? box : box.querySelector('input:not([type="checkbox"]), textarea')) as HTMLInputElement | null;
    if (!input) throw new Error(`в «${String(label)}» нет поля ввода`);
    act(() => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: text } });
      const chips = input.closest('.chips');
      if (chips) fireEvent.keyDown(chips, { key: 'Enter' });
      fireEvent.blur(input);
    });
    openAll();
  };

  const formula = (label: string | HTMLElement, text: string): void => {
    const box = typeof label === 'string' ? field(label) : label;
    const chips = box.classList.contains('chips') ? box : box.querySelector('.chips');
    if (!chips) throw new Error(`в «${String(label)}» нет поля формулы`);
    const inputs = [...chips.querySelectorAll<HTMLInputElement>('input.chips__text')];
    act(() => {
      for (const x of [...chips.querySelectorAll<HTMLElement>('.chips__x')].reverse()) fireEvent.mouseDown(x);
    });
    const left = [...chips.querySelectorAll<HTMLInputElement>('input.chips__text')];
    const input = left[0] ?? inputs[0];
    if (!input) throw new Error(`в «${String(label)}» нет ввода формулы`);
    act(() => {
      for (const other of left.slice(1)) fireEvent.change(other, { target: { value: '' } });
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(chips, { key: 'Enter' });
    });
    openAll();
  };

  const check = (label: string, on = true): void => {
    const el = root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${label}"]`);
    if (!el) throw new Error(`нет флажка «${label}»`);
    if (el.checked !== on) act(() => { fireEvent.click(el); });
  };

  const arg = (name: string): HTMLElement => {
    const pairs = [...root.querySelectorAll<HTMLElement>('.pair')];
    const found = pairs.find(p => textOf(p.querySelector('.call-args__name') ?? p) === name);
    if (!found) throw new Error(`нет аргумента «${name}»; есть: ${pairs.map(p => textOf(p.querySelector('.call-args__name') ?? p)).join(' | ')}`);
    return found;
  };

  const args = (): string[] => [...root.querySelectorAll<HTMLElement>('.pair .call-args__name')].map(textOf);

  return { arg, args, button, has, click, cell, field, select, type, formula, check };
}

export const stepCard = (title: RegExp): HTMLElement => {
  const heads = [...document.querySelectorAll<HTMLElement>('.card')];
  const head = (card: HTMLElement) => textOf(card.querySelector('.card__head, .step-fold, .step-fold__row') ?? card).replace(/^[▾▸]\s*/, '');
  const found = heads.find(card => title.test(head(card)));
  if (!found) throw new Error(`нет шага ${String(title)}; есть: ${heads.map(c => textOf(c.querySelector('.card__head, .step-fold__row') ?? c).slice(0, 40)).join(' | ')}`);
  return found;
};
