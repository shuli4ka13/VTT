// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { System } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import { useOpened } from '../../store/opened.ts';
import { ConstructorScreen } from './constructor.tsx';
import { findAnchor } from '../../guide/anchor.ts';
import { openAll } from '../../testing/render-open.tsx';
import base from '../../guide/seeds/base.json' with { type: 'json' };

const mount = () => render(<MemoryRouter><ConstructorScreen /></MemoryRouter>);

const press = (text: string, within?: string) => {
  const el = findAnchor({ text, ...(within ? { in: within } : {}) });
  expect(el, `нет «${text}»`).not.toBeNull();
  act(() => { fireEvent.click(el!); });
  openAll();
};

const focused = (): HTMLInputElement => document.activeElement as HTMLInputElement;

const expectNameFocused = (placeholder: string) => {
  const el = focused();
  expect(el.tagName, `фокус не в поле «${placeholder}»`).toBe('INPUT');
  expect(el.getAttribute('placeholder')).toBe(placeholder);
  expect(el.selectionStart).toBe(0);
  expect(el.selectionEnd).toBe(el.value.length);
};

describe('новая сущность — фокус в поле её названия', () => {
  beforeEach(() => {
    localStorage.clear();
    useOpened.setState({ opened: {} });
    useWorld.getState().replaceWorld({ system: base as unknown as System, compendium: { records: [] }, sheets: [] });
  });
  afterEach(cleanup);

  it('«+ блок», «+ таблица», «+ строка», «+» колонки на листе', () => {
    useWorld.setState({ activeTab: 'sheet' });
    mount();
    openAll();
    press('блоки и типы листов');
    press('+ блок', 'Листы');
    expectNameFocused('как зовётся блок');
    press('+ таблица', 'Новый блок');
    expectNameFocused('как зовётся таблица');
    press('+ строка');
    expect(focused().tagName).toBe('INPUT');
    expect(focused().getAttribute('placeholder')).toBe('как зовётся строка');
    const plus = () => findAnchor({ guide: 'add-column' })!.querySelector('button')!;
    act(() => { fireEvent.click(plus()); });
    openAll();
    expectNameFocused('как зовётся колонка');
    act(() => { fireEvent.change(focused(), { target: { value: 'Первая' } }); fireEvent.blur(focused()); });
    act(() => { fireEvent.click(plus()); });
    openAll();
    expectNameFocused('как зовётся колонка');
  });

  it('«+ кнопкой» в пустой библиотеке эффектов', () => {
    useWorld.getState().replaceWorld({ system: { ...(base as unknown as System), effects: {}, grants: [] }, compendium: { records: [] }, sheets: [] });
    useWorld.setState({ activeTab: 'effects' });
    mount();
    openAll();
    press('+ кнопкой');
    expectNameFocused('как зовётся эффект');
  });


  it('«+ блок» и «+ кнопкой» в библиотеке эффектов, «+ ещё одно» и «+ итог» у эффекта', () => {
    useWorld.setState({ activeTab: 'effects' });
    mount();
    openAll();
    press('+ блок', 'Библиотека эффектов');
    expectNameFocused('как зовётся эффект');
    press('+ ещё одно', 'Что приходит');
    const form = focused().closest('.param-form');
    expect(form, 'фокус в форме нового входа').not.toBeNull();
    expect(focused().value).toBe('Новый вход');
    expect(focused().selectionStart).toBe(0);
    expect(focused().selectionEnd).toBe('Новый вход'.length);
    press('+ итог');
    expect(focused().value).toBe('Новый итог');
  });

  it('«+ таблица» в разделе «Таблицы»', () => {
    useWorld.setState({ activeTab: 'dictionaries' });
    mount();
    openAll();
    const word = [...document.querySelectorAll<HTMLElement>('button')].find(b => (b.textContent ?? '').trim() === 'Таблицы');
    if (word) { act(() => { fireEvent.click(word); }); openAll(); }
    press('+ таблица');
    expectNameFocused('как зовётся таблица');
  });

  it('«+ тип» в пустом списке типов', () => {
    useWorld.setState({ activeTab: 'records' });
    mount();
    openAll();
    press('+ тип');
    expectNameFocused('как зовётся тип');
  });
});
