// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import { sunOf } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { EffectsTab } from '../../effects-tab.tsx';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { load } from '../../../../../testing/round-trip.tsx';
import { englishWorld, russianIn } from '../../../../../testing/english.tsx';
import { shownText } from '../../../../../testing/no-keys.tsx';
import { pickCombo, comboOptions } from '../../../../../testing/cards.ts';

vi.setConfig({ testTimeout: 30_000 });

const gift = vi.hoisted(() => ({ slot: false }));

vi.mock('../../../../../engine/dry-run.ts', async importOriginal => {
  const real = await importOriginal<typeof import('../../../../../engine/dry-run.ts')>();
  return {
    ...real,
    mannequinsOf: (system: never) => {
      const pair = real.mannequinsOf(system);
      return gift.slot ? pair.map((sheet, at) => (at === 0 ? { ...sheet, values: { ...sheet.values, 'slots.1.left': 1 } } : sheet)) : pair;
    },
  };
});

const dnd = SAMPLE_WORLDS.find(world => world.system.name === 'D&D 5e')!;
const system = dnd.system as unknown as System;

const canvas = (): HTMLElement => document.querySelector<HTMLElement>('.sun-canvas')!;
const bubble = (key: string): HTMLElement => canvas().querySelector<HTMLElement>(`[data-bubble="${key}"]`)!;
const keyOf = (effect: string, label: string): string => sunOf(system, effect)!.rays.find(ray => ray.label === label)!.key;
const lit = (key: string): boolean => bubble(key).classList.contains('sun-bubble--lit');
const litKeys = (prefix: string): string[] => [...canvas().querySelectorAll<HTMLElement>('.sun-bubble--lit')].map(one => one.dataset.bubble!).filter(key => key.startsWith(prefix));
const combo = (value: string): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('[role="combobox"]')].find(one => comboOptions(one).some(option => option.value === value))!;

function open(effect: string, dice?: string): void {
  load(structuredClone(dnd), { activeTab: 'effects', activeEffectId: effect });
  useEffectView.setState({ view: 'sun', trail: [] });
  render(<EffectsTab />);
  fireEvent.click(screen.getByRole('tab', { name: 'Проба' }));
  if (dice) pickCombo(combo('max'), dice);
}

describe('вкладка «Проба» в пузырях', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocale.getState().setLang('ru');
    gift.slot = false;
  });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('«Атака»: на «макс» бросок горит, на «мин» шаги под «попал?» не горят', () => {
    open('strike', 'max');
    expect(lit(keyOf('strike', 'бросок'))).toBe(true);
    pickCombo(combo('min'), 'min');
    const sun = sunOf(system, 'strike')!;
    const hit = sun.rays.find(ray => ray.label === 'попал?')!;
    expect(lit(keyOf('strike', 'бросок'))).toBe(true);
    for (const ray of sun.rays.filter(one => one.under === hit.key)) expect(lit(ray.key)).toBe(false);
  });

  it('«снять подсветку» убирает классы и легенду', () => {
    open('strike', 'max');
    expect(document.querySelector('.sun-lit-legend')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'снять подсветку' }));
    expect(canvas().querySelector('.sun-bubble--lit, .sun-bubble--dim, .sun-bubble--skipped')).toBeNull();
    expect(document.querySelector('.sun-lit-legend')).toBeNull();
  });

  it('уход с вкладки «Проба» снимает подсветку', () => {
    open('strike', 'max');
    fireEvent.click(screen.getByRole('tab', { name: 'Где используется' }));
    expect(canvas().querySelector('.sun-bubble--lit')).toBeNull();
  });

  it('«Щит»: блок «Что случилось», две подписки, «цель» — носитель, «попал» — включён; без ячейки — причина словами', () => {
    open('shield');
    const block = document.querySelector<HTMLElement>('.sundock__case')!;
    expect(block.textContent).toContain('Что случилось');
    expect(comboOptions(combo('1')).map(option => option.value)).toEqual(expect.arrayContaining(['0', '1']));
    const target = [...block.querySelectorAll<HTMLElement>('.field')].find(one => one.querySelector('.field__label')?.textContent === 'цель')!;
    expect((target.querySelector('[role="combobox"]') as HTMLInputElement).value).toBe('носитель');
    expect((screen.getByRole('checkbox', { name: 'попал' }) as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain('нет ячейки 1-го круга');
    expect(canvas().querySelector('.sun-bubble--lit')).toBeNull();
  });

  it('«Щит» с ячейкой у носителя: проба проходит, горит первая подписка и не горит вторая; смена подписки перезапускает пробу', () => {
    gift.slot = true;
    open('shield');
    expect(document.body.textContent).not.toContain('нет ячейки');
    expect(litKeys('on0:').length).toBeGreaterThan(0);
    expect(lit('on0:when')).toBe(true);
    expect(litKeys('on1:')).toEqual([]);
    pickCombo(combo('1'), '1');
    expect(litKeys('on1:').length).toBeGreaterThan(0);
    expect(litKeys('on0:')).toEqual([]);
  });

  it('«по умолчанию» возвращает значения услышанного', () => {
    gift.slot = true;
    open('shield');
    const box = screen.getByRole('checkbox', { name: 'попал' }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'по умолчанию' }));
    expect((screen.getByRole('checkbox', { name: 'попал' }) as HTMLInputElement).checked).toBe(true);
  });

  it('«Лежит» без подписок: прогонять нечего', () => {
    open('prone');
    expect(document.querySelector('.sundock__body')!.textContent).toContain('прогонять нечего');
  });

  it('при английском интерфейсе в блоке «Что случилось» нет русских подписей экрана', () => {
    gift.slot = true;
    load(englishWorld(structuredClone(dnd)), { activeTab: 'effects', activeEffectId: 'shield' });
    useLocale.getState().setLang('en');
    useEffectView.setState({ view: 'sun', trail: [] });
    render(<EffectsTab />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trial' }));
    const block = document.querySelector<HTMLElement>('.sundock__case')!;
    expect(block.textContent).toContain('What happened');
    expect(russianIn(shownText(block))).toEqual([]);
    useLocale.getState().setLang('ru');
  });
});
