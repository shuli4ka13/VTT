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

  const condBox = (): HTMLElement => {
    const all = [...root.querySelectorAll<HTMLElement>('.cond')];
    const own = all.find(c => !c.closest('.flow-head') || c.closest('.flow-head') === root);
    if (!own) throw new Error('нет условия');
    return own;
  };

  const condRows = (): HTMLElement[] => [...condBox().querySelectorAll<HTMLElement>(':scope > .cond__row')];

  const when = (...facts: string[]): void => {
    facts.forEach((fact, at) => {
      if (at === 0 && !condRows().length) within(condBox()).click('+ условие');
      if (at > 0) within(condRows()[at - 1]!).click('+ и');
      const row = condRows()[at];
      if (!row) throw new Error(`нет строки условия №${at + 1}`);
      const box = row.querySelector<HTMLElement>('.cond__fact')!;
      if (fact.startsWith('=')) {
        if (!box.querySelector('.cond__formula')) within(box).select(box.querySelector('select')!, ':формула');
        within(box).formula(condRows()[at]!.querySelector<HTMLElement>('.cond__formula')!, fact.slice(1));
      } else within(box).select(box.querySelector('select')!, fact);
    });
  };

  const unwhen = (at = 0): void => {
    const row = condRows()[at];
    if (!row) throw new Error(`нет строки условия №${at + 1}`);
    within(row).click('×');
  };

  const whenOptions = (at = 0): string[] => {
    const row = condRows()[at];
    const el = row?.querySelector<HTMLSelectElement>('.cond__fact select');
    return el ? [...el.options].map(textOf) : [];
  };

  return { arg, args, button, has, click, cell, field, select, type, formula, check, when, unwhen, whenOptions, condRows };
}

export const blocks = (root: ParentNode = document): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.flow-block')];

export const block = (at: number, root: ParentNode = document): HTMLElement => {
  const found = blocks(root)[at];
  if (!found) throw new Error(`нет блока «Если» №${at + 1}; всего ${blocks(root).length}`);
  return found;
};

export const armOf = (flow: HTMLElement, at = 0): HTMLElement => {
  const found = [...flow.querySelectorAll<HTMLElement>(':scope > .flow-block__part')][at];
  if (!found) throw new Error(`в блоке нет ветки №${at + 1}`);
  return found;
};

export const headOf = (flow: HTMLElement, at = 0): HTMLElement => armOf(flow, at).querySelector<HTMLElement>(':scope > .flow-head')!;

export const armWord = (flow: HTMLElement, at = 0): string => textOf(headOf(flow, at).querySelector('.flow-head__word')!);

export const addToArm = (flow: HTMLElement, at: number, brick: string): void => {
  const el = armOf(flow, at).querySelector<HTMLSelectElement>(':scope > .flow-block__arm > .flow-block__add select');
  if (!el) throw new Error('в ветке нет «+ шаг»');
  within(el.parentElement!).select(el, brick);
};

export const addArm = (flow: HTMLElement, label: '+ иначе, если' | '+ иначе'): void => {
  within(flow.querySelector<HTMLElement>(':scope > .flow-block__foot')!).click(label);
};

export const stopStrip = (n: number, root: ParentNode = document): HTMLElement => {
  const all = [...root.querySelectorAll<HTMLElement>('.flow-stop')];
  const found = all.find(el => textOf(el.querySelector('.flow-stop__word')!).startsWith(`${n} · `));
  if (!found) throw new Error(`нет стопа ${n}; есть: ${all.map(el => textOf(el.querySelector('.flow-stop__word')!)).join(' | ')}`);
  return found;
};

export const stopNote = (n: number, text: string, root: ParentNode = document): void => {
  const strip = stopStrip(n, root);
  within(strip).type(strip.querySelector<HTMLElement>('.flow-stop__note input')!, text);
};

export const lastNumber = (root: ParentNode = document): number => {
  const heads = [...root.querySelectorAll<HTMLElement>('.card .step-fold, .card .card__head, .flow-stop__word, .steps__split-title')].map(textOf);
  return Math.max(0, ...heads.map(t => Number(/^[▾▸]?\s*(\d+) · /.exec(t)?.[1] ?? 0)));
};

export const stepCard = (title: RegExp, root: ParentNode = document): HTMLElement => {
  const heads = [...root.querySelectorAll<HTMLElement>('.card')];
  const head = (card: HTMLElement) => textOf(card.querySelector('.card__head, .step-fold, .step-fold__row') ?? card).replace(/^[▾▸]\s*/, '');
  const found = heads.find(card => title.test(head(card)));
  if (!found) throw new Error(`нет шага ${String(title)}; есть: ${heads.map(c => textOf(c.querySelector('.card__head, .step-fold__row') ?? c).slice(0, 40)).join(' | ')}`);
  return found;
};

export const wrapIf = (card: () => HTMLElement, ...facts: string[]): void => {
  within(card()).click('в «Если»');
  const flow = card().closest<HTMLElement>('.flow-block');
  if (!flow) throw new Error('шаг не попал в «Если»');
  within(headOf(flow)).when(...facts);
};
