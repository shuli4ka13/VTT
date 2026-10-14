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

  const click = (text: string | RegExp): void => {
    if (!has(text)) {
      const more = [...root.querySelectorAll<HTMLElement>('.effect-head__toggle button')].find(b => textOf(b) === 'ещё');
      if (more) { act(() => { fireEvent.click(more); }); openAll(); }
    }
    act(() => { fireEvent.click(button(text)); });
    openAll();
  };

  const lookup = (label: string, row: number): HTMLElement | null => {
    const named = root.querySelector<HTMLElement>(`[data-field="${label}"]`);
    if (named) return named;
    for (const grid of root.querySelectorAll<HTMLElement>('.sheet-grid')) {
      const children = [...grid.children] as HTMLElement[];
      const heads = children.filter(c => c.classList.contains('sheet-grid__head'));
      const at = heads.findIndex(h => textOf(h.querySelector('.sheet-grid__title') ?? h) === label);
      if (at < 0) continue;
      const found = children[heads.length * (row + 1) + at];
      if (found) return found;
    }
    const item = root.querySelectorAll<HTMLElement>('.param-item')[row];
    if (item) {
      if (!item.querySelector('.param-form')) {
        act(() => { fireEvent.click(item.querySelector('.param-line__sum')!); });
        openAll();
      }
      const find = () => [...item.querySelectorAll<HTMLElement>('.param-form .field')]
        .find(f => textOf(f.querySelector('.field__label') ?? f) === label) ?? null;
      let found = find();
      const more = [...item.querySelectorAll<HTMLElement>('.param-form button')].find(b => textOf(b) === 'ещё');
      if (!found && more) { act(() => { fireEvent.click(more); }); openAll(); found = find(); }
      if (found) return found;
    }
    return null;
  };

  const cell = (label: string, row = 0): HTMLElement => {
    let found = lookup(label, row);
    if (!found) {
      const more = [...root.querySelectorAll<HTMLElement>('.effect-head__toggle button')].find(b => textOf(b) === 'ещё');
      if (more) { act(() => { fireEvent.click(more); }); openAll(); found = lookup(label, row); }
    }
    if (!found) throw new Error(`нет клетки «${label}» в строке ${row}`);
    return found;
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
    const spoken = box.classList.contains('formula-words') ? box : box.querySelector<HTMLElement>('.formula-words');
    if (spoken) { act(() => { fireEvent.click(spoken); }); }
    const byList = [...box.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === ':формула'));
    if (byList && !box.querySelector('.chips')) { act(() => { fireEvent.change(byList, { target: { value: ':формула' } }); }); openAll(); }
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
    const find = () => root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${label}"]`);
    if (!find()) {
      for (const item of root.querySelectorAll<HTMLElement>('.param-item')) {
        if (!item.querySelector('.param-form')) { act(() => { fireEvent.click(item.querySelector('.param-line__sum')!); }); openAll(); }
      }
      for (const form of root.querySelectorAll<HTMLElement>('.param-form')) {
        const more = [...form.querySelectorAll<HTMLElement>('button')].find(b => textOf(b) === 'ещё');
        if (more) { act(() => { fireEvent.click(more); }); openAll(); }
      }
    }
    const el = find();
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

export const armLabel = (flow: HTMLElement, at = 0): string => {
  const arm = armOf(flow, at);
  const own = arm.querySelector<HTMLElement>(':scope > .flow-block__arm > .flow-block__then');
  return textOf(own ?? headOf(flow, at).querySelector('.flow-head__word')!);
};

export const addToArm = (flow: HTMLElement, at: number, brick: string): void => {
  const el = armOf(flow, at).querySelector<HTMLSelectElement>(':scope > .flow-block__arm > .flow-block__add select');
  if (!el) throw new Error('в ветке нет «+ шаг»');
  within(el.parentElement!).select(el, brick);
};

export const addArm = (flow: HTMLElement, label: string): void => {
  within(flow.querySelector<HTMLElement>(':scope > .flow-block__foot')!).click(label);
};

export const isFused = (flow: HTMLElement): boolean => flow.classList.contains('flow-block--check');

export const outcomeIf = (check: number, passed: boolean, root: ParentNode = document): number => {
  within(root).click('+ если');
  const at = blocks(root).length - 1;
  within(headOf(block(at, root))).when(`Проверка — ${passed ? 'пройдена' : 'не пройдена'}`);
  if (!isFused(block(at, root))) throw new Error(`блок по исходу шага ${check} не склеился с проверкой`);
  return at;
};

export const callIf = (step: number, called: string, outcome: string, root: ParentNode = document): number => {
  within(root).click('+ если');
  const at = blocks(root).length - 1;
  within(headOf(block(at, root))).when(`${called} — ${outcome}`);
  if (!isFused(block(at, root))) throw new Error(`блок по исходу шага ${step} не склеился с вызовом`);
  return at;
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
  const heads = [...root.querySelectorAll<HTMLElement>('.card .step-fold, .card .card__head, .flow-stop__word, .steps__split-title, .flow-head__word')].map(textOf);
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

export const dragParamBefore = (from: string, to: string, root: ParentNode = document): void => {
  const line = (name: string) => [...root.querySelectorAll<HTMLElement>('.param-line')]
    .find(el => textOf(el.querySelector('.param-line__name') ?? el) === name);
  const source = line(from);
  const target = line(to);
  if (!source || !target) throw new Error(`нет входа «${from}» или «${to}»`);
  const dataTransfer = { setData: () => {}, effectAllowed: '' };
  act(() => { fireEvent.dragStart(source, { dataTransfer }); });
  act(() => { fireEvent.dragOver(target, { dataTransfer }); });
  act(() => { fireEvent.drop(target, { dataTransfer }); });
  openAll();
};
