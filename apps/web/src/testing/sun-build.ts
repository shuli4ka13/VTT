import { fireEvent, act } from '@testing-library/react';
import { openAll } from './render-open.tsx';
import { within, stepCard } from './cards.ts';

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const press = (el: HTMLElement): void => {
  act(() => { fireEvent.click(el); });
  openAll();
};

export const showBubbles = (): void => {
  const found = [...document.querySelectorAll<HTMLElement>('.sun-switch button')].find(one => textOf(one) === 'Пузыри');
  if (!found) throw new Error('нет переключателя «Пузыри»');
  press(found);
  if (!document.querySelector('.sun-canvas')) throw new Error('вид «Пузыри» не открылся');
};

export const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.sun-canvas')!;

export const rays = (): HTMLElement[] => [...canvas().querySelectorAll<HTMLElement>('.sun-bubble--ray')];

const numberOf = (bubble: HTMLElement): string => textOf(bubble.querySelector('.sun-bubble__num') ?? bubble).replace(/[^\d]/g, '');

export const ray = (which: number | RegExp): HTMLElement => {
  const all = rays();
  const found = typeof which === 'number'
    ? all.find(one => numberOf(one) === String(which))
    : all.find(one => which.test(one.getAttribute('aria-label') ?? textOf(one)));
  if (!found) throw new Error(`нет луча ${String(which)}; есть: ${all.map(one => one.getAttribute('aria-label')).join(' | ')}`);
  return found;
};

export const pickRay = (which: number | RegExp): HTMLElement => {
  const bubble = ray(which);
  press(bubble);
  return bubble;
};

export const pickHandler = (at: number): void => {
  const found = canvas().querySelector<HTMLElement>(`[data-bubble="on${at}:when"]`);
  if (!found) throw new Error(`нет подписки №${at + 1}`);
  press(found);
};

export const pickCenter = (): void => {
  const found = canvas().querySelector<HTMLElement>('[data-bubble="center"]');
  if (!found) throw new Error('нет центра');
  press(found);
};

export const selectedRay = (): HTMLElement | null => canvas().querySelector<HTMLElement>('.sun-bubble--ray[aria-pressed="true"]');

export const panel = (): HTMLElement => document.querySelector<HTMLElement>('.sun-panel')!;

export const stepRoot = (): HTMLElement => {
  const own = panel().querySelector<HTMLElement>('.sun-panel__step');
  if (!own) throw new Error('в панели нет шага');
  return own;
};

export const inPanel = (): ReturnType<typeof within> => within(panel());

export const inStep = (): ReturnType<typeof within> => within(stepRoot());

export const stepIn = (n: number): HTMLElement => stepCard(new RegExp(`^${n} · `), stepRoot());

export const headIn = (): ReturnType<typeof within> => {
  const head = stepRoot().querySelector<HTMLElement>('.flow-head');
  if (!head) throw new Error('в панели нет условия «Если»');
  return within(head);
};

export const chip = (label: string, kind?: string): HTMLElement => {
  const all = [...document.querySelectorAll<HTMLElement>('.sun-palette [data-palette]')]
    .filter(one => !kind || (one.dataset.palette ?? '').startsWith(`${kind}:`));
  const found = all.find(one => textOf(one) === label);
  if (!found) throw new Error(`нет чипа «${label}»; есть: ${all.map(textOf).join(' | ')}`);
  return found;
};

export const chipOff = (label: string, kind?: string): boolean => chip(label, kind).getAttribute('aria-disabled') === 'true';

export const add = (label: string, kind?: string): void => {
  const found = chip(label, kind);
  if (found.getAttribute('aria-disabled') === 'true') throw new Error(`чип «${label}» недоступен: ${found.title}`);
  press(found);
};

export const where = (mode: 'inside' | 'after'): void => {
  const word = mode === 'inside' ? 'внутрь' : 'после блока';
  const found = [...panel().querySelectorAll<HTMLElement>('.sun-panel__row button')].find(one => textOf(one) === word);
  if (!found) throw new Error(`нет кнопки «${word}»`);
  press(found);
};

const rowButton = (label: string): HTMLElement => {
  const found = [...panel().querySelectorAll<HTMLElement>('.sun-panel__row button')].find(one => textOf(one) === label);
  if (!found) throw new Error(`нет кнопки «${label}» в ряду панели`);
  return found;
};

export const up = (): void => press(rowButton('↑'));

export const down = (): void => press(rowButton('↓'));

export const removeStep = (): void => {
  press(rowButton('Удалить шаг'));
  const sure = panel().querySelector<HTMLElement>('.sun-panel__row .danger-confirm button');
  if (sure) press(sure);
};

export const outside = (head: number | RegExp): void => {
  pickRay(head);
  where('after');
};
