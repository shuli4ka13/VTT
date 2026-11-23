// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useWorld, emptySystem } from '../../store/world.ts';
import { useOpened } from '../../store/opened.ts';
import { ConstructorScreen } from './constructor.tsx';
import { findAnchor } from '../../guide/anchor.ts';
import { fieldsOf } from '@vtt/engine';
import type { Table } from '@vtt/schema';

const TAKES_FOCUS = 'button, input, textarea, select, summary, [tabindex]';

const mount = () => render(<StrictMode><MemoryRouter><ConstructorScreen /></MemoryRouter></StrictMode>);

const click = (el: HTMLElement) => {
  act(() => {
    fireEvent.mouseDown(el);
    const taker = el.closest<HTMLElement>(TAKES_FOCUS);
    if (taker) taker.focus(); else (document.activeElement as HTMLElement | null)?.blur();
  });
  if (!el.isConnected) return;
  act(() => { fireEvent.mouseUp(el); fireEvent.click(el); });
};

const press = (text: string, within?: string) => {
  const el = findAnchor({ text, ...(within ? { in: within } : {}) });
  expect(el, `нет «${text}»`).not.toBeNull();
  click(el!);
};

const focused = (): HTMLElement => document.activeElement as HTMLElement;

const type = (text: string) => {
  for (const char of text) {
    const el = focused();
    if (el instanceof HTMLInputElement) {
      const from = el.selectionStart ?? el.value.length;
      const to = el.selectionEnd ?? el.value.length;
      act(() => { fireEvent.change(el, { target: { value: el.value.slice(0, from) + char + el.value.slice(to) } }); });
    } else if (char === ' ' && el instanceof HTMLButtonElement) {
      act(() => { fireEvent.click(el); });
    }
  }
};

const enter = () => {
  const el = focused();
  act(() => { fireEvent.keyDown(el, { key: 'Enter' }); });
  if (el instanceof HTMLButtonElement && focused() === el) act(() => { fireEvent.click(el); });
};

const expectTyping = (placeholder: string) => {
  const el = focused() as HTMLInputElement;
  const seen = el.tagName === 'INPUT' ? `поле «${el.getAttribute('placeholder') ?? ''}»` : `${el.tagName} «${(el.textContent ?? '').trim().slice(0, 24)}»`;
  expect(seen, 'куда пойдёт набор с клавиатуры').toBe(`поле «${placeholder}»`);
  expect([el.selectionStart, el.selectionEnd], 'прежнее имя выделено целиком').toEqual([0, el.value.length]);
};

const inputs = (placeholder: string) => [...document.querySelectorAll<HTMLInputElement>(`input[placeholder="${placeholder}"]`)];
const system = () => useWorld.getState().system;
const labels = () => fieldsOf(system()).map(field => field.label);
const tables = (): Table[] => Object.values(system().tables ?? {}).filter(table => table.shape !== 'single');
const rowsOf = (table: Table | undefined) => (table?.rows ?? []).map(row => row.label ?? row.value);
const openFold = (name: string) => {
  const fold = [...document.querySelectorAll<HTMLElement>('.block-fold__name')].find(el => el.textContent === name)!.closest('details')!;
  if (!fold.open) click(fold.querySelector<HTMLElement>('.block-fold__count')!);
  expect(fold.open, `блок «${name}» раскрыт`).toBe(true);
};

const start = (tab: 'sheet' | 'dictionaries' = 'sheet') => {
  useWorld.setState({ activeTab: tab });
  mount();
  if (tab === 'sheet') press('блоки и типы листов');
};

const block = (name: string) => {
  press('+ блок', 'Листы');
  expectTyping('как зовётся блок');
  type(name);
  enter();
};

describe('ввод не пропадает: редактор живёт у сущности, а не у её ключа и не у места на экране', () => {
  beforeEach(() => {
    localStorage.clear();
    useOpened.setState({ opened: {} });
    useWorld.getState().replaceWorld({ system: emptySystem(), compendium: { records: [] }, sheets: [] });
  });
  afterEach(cleanup);

  it('«+ поле» при открытом поле: набор идёт в название нового поля, пробел не заводит ещё одно', () => {
    start();
    block('Бой');
    press('+ поле', 'Листы');
    expectTyping('как зовётся поле');
    type('Хиты');
    enter();
    expect(labels()).toEqual(['Хиты']);

    openFold('Бой');
    press('+ поле', 'Листы');
    expectTyping('как зовётся поле');
    type('Класс брони');
    enter();
    expect(labels()).toEqual(['Хиты', 'Класс брони']);

    press('+ поле', 'Листы');
    type('Скорость');
    press('+ поле', 'Листы');
    expectTyping('как зовётся поле');
    expect(labels()).toEqual(['Хиты', 'Класс брони', 'Скорость', 'Новое поле']);
  });

  it('название таблицы подтверждено щелчком в её первую строку: набранное «Сила» остаётся после Enter', () => {
    start();
    block('Характеристики');
    press('+ таблица', 'Характеристики');
    expectTyping('как зовётся таблица');
    type('Характеристики');
    click(inputs('как зовётся строка')[0]!);
    expect(tables()[0]!.label).toBe('Характеристики');
    expect(focused().getAttribute('placeholder'), 'щелчок в строку не потерян').toBe('как зовётся строка');
    type('Сила');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['Сила']);
    expect(inputs('как зовётся строка').map(el => el.value)).toEqual(['Сила']);
  });

  it('название таблицы подтверждено нажатием «+ строка»: строка добавлена, набор идёт в неё', () => {
    start();
    block('Характеристики');
    press('+ таблица', 'Характеристики');
    type('Характеристики');
    press('+ строка');
    expect(tables()[0]!.label).toBe('Характеристики');
    expect(tables()[0]!.rows).toHaveLength(2);
    expect(focused(), 'набор идёт в новую строку').toBe(inputs('как зовётся строка')[1]);
    type('Ловкость');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['', 'Ловкость']);
  });

  it('Enter сохраняет название таблицы и строк; после «+ строка» набор идёт в новую строку', () => {
    start();
    block('Характеристики');
    press('+ таблица', 'Характеристики');
    type('Характеристики');
    enter();
    expect(tables()[0]!.label).toBe('Характеристики');
    click(inputs('как зовётся строка')[0]!);
    type('Сила');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['Сила']);
    press('+ строка');
    expect(focused()).toBe(inputs('как зовётся строка')[1]);
    type('Ловкость');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['Сила', 'Ловкость']);
    expect(inputs('как зовётся строка').map(el => el.value)).toEqual(['Сила', 'Ловкость']);
  });

  it('переименование по Enter не пересоздаёт редактор таблицы: поле строки остаётся тем же', () => {
    start();
    block('Характеристики');
    press('+ таблица', 'Характеристики');
    const row = inputs('как зовётся строка')[0]!;
    type('Характеристики');
    enter();
    expect(tables()[0]!.label).toBe('Характеристики');
    expect(row.isConnected, 'поле строки то же, что до переименования').toBe(true);
    click(row);
    type('Сила');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['Сила']);
  });

  it('название блока подтверждено нажатием «+ поле» в нём: поле заведено, набор идёт в его название', () => {
    start();
    press('+ блок', 'Листы');
    type('Бой');
    press('+ поле', 'Листы');
    expect((system().blocks ?? []).map(one => one.label)).toEqual(['Бой']);
    expect(labels()).toEqual(['Новое поле']);
    expectTyping('как зовётся поле');
    type('Хиты');
    enter();
    expect(labels()).toEqual(['Хиты']);
  });

  it('название подтверждено щелчком по кнопке того же редактора — щелчок срабатывает: блок, поле, колонка таблицы', () => {
    start();
    press('+ блок', 'Листы');
    type('Бой');
    click(focused().closest('.card')!.querySelector<HTMLElement>('.card__head button')!);
    expect((system().blocks ?? []).map(one => one.label)).toEqual(['Бой']);
    expect(inputs('как зовётся блок'), 'панель блока закрыта своей кнопкой').toHaveLength(0);

    openFold('Бой');
    press('+ поле', 'Листы');
    type('Хиты');
    click(focused().closest('.card')!.querySelector<HTMLElement>('button[title="свернуть"]')!);
    expect(labels()).toEqual(['Хиты']);
    expect(inputs('как зовётся поле'), 'панель поля закрыта своей кнопкой').toHaveLength(0);

    openFold('Бой');
    press('+ таблица', 'Бой');
    click(findAnchor({ guide: 'add-column' })!.querySelector('button')!);
    expectTyping('как зовётся колонка');
    type('Модификатор');
    click(focused().closest('.card')!.querySelector<HTMLElement>('button[title="свернуть"]')!);
    expect((tables()[0]!.columns ?? []).map(column => column.label)).toContain('Модификатор');
    expect(inputs('как зовётся колонка'), 'панель колонки закрыта своей кнопкой').toHaveLength(0);
  });

  it('взведённое «Удалить» не переходит на другое поле', () => {
    start();
    block('Бой');
    press('+ поле', 'Листы');
    type('Хиты');
    enter();
    press('Бой', 'Листы');
    press('+ поле', 'Листы');
    type('Броня');
    enter();
    expect(labels()).toEqual(['Хиты', 'Броня']);
    openFold('Бой');
    press('Хиты', 'Бой');
    press('Удалить', 'Лист');
    expect(findAnchor({ text: 'точно убрать' }), 'удаление «Хитов» взведено').not.toBeNull();
    press('Броня', 'Бой');
    expect(inputs('как зовётся поле').map(el => el.value)).toEqual(['Броня']);
    expect(findAnchor({ text: 'точно убрать' }), 'у «Брони» удаление не взведено').toBeNull();
    expect(labels()).toEqual(['Хиты', 'Броня']);
  });

  it('вторая подряд новая сущность того же вида: набор идёт в её название — блок, таблица, тип листа, страница', () => {
    start();
    press('+ блок', 'Листы');
    expectTyping('как зовётся блок');
    press('+ блок', 'Листы');
    expectTyping('как зовётся блок');
    expect(focused()).toHaveProperty('value', 'Новый блок 2');

    press('+ таблица', 'Новый блок 2');
    expectTyping('как зовётся таблица');
    openFold('Новый блок 2');
    press('+ таблица', 'Новый блок 2');
    expectTyping('как зовётся таблица');
    expect(tables()).toHaveLength(2);

    press('+ тип листа', 'Листы');
    expectTyping('как зовётся тип листа');
    press('+ тип листа', 'Листы');
    expectTyping('как зовётся тип листа');
    expect(Object.keys(system().sheets ?? {})).toHaveLength(2);

    press('образец листа');
    press('+ страница');
    expectTyping('как зовётся страница');
    press('+ страница');
    expectTyping('как зовётся страница');
    expect(focused()).toHaveProperty('value', 'Страница 2');
  });

  it('«Правила» → «Таблицы»: название подтверждено щелчком в строку — и у таблицы, которая от названия переезжает в списке', () => {
    start('dictionaries');
    press('+ таблица');
    expectTyping('как зовётся таблица');
    type('Характеристики');
    click(inputs('как зовётся строка')[0]!);
    expect(focused().getAttribute('placeholder'), 'щелчок в строку не потерян').toBe('как зовётся строка');
    type('Сила');
    enter();
    expect(rowsOf(tables()[0])).toEqual(['Сила']);

    press('+ таблица');
    expectTyping('как зовётся таблица');
    expect(inputs('как зовётся таблица').map(el => el.value)).toEqual(['', 'Характеристики']);
    type('Яды');
    const row = focused().closest('details')!.querySelector<HTMLInputElement>('input[placeholder="как зовётся строка"]')!;
    click(row);
    expect(inputs('как зовётся таблица').map(el => el.value), 'таблица переехала по названию').toEqual(['Характеристики', 'Яды']);
    expect(focused(), 'щелчок в строку переехавшей таблицы не потерян').toBe(row);
    type('Мышьяк');
    enter();
    expect(tables().map(table => `${table.label}: ${rowsOf(table).join(', ')}`)).toEqual(['Характеристики: Сила', 'Яды: Мышьяк']);
  });
});
