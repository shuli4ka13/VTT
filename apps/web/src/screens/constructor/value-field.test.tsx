// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { optionsFor, ValueField, normalizeDice, asText, grownFrom } from './value-field.tsx';
import type { SlotContext } from './slots.tsx';
import type { System, Effect } from '@vtt/schema';

const ctx: SlotContext = {
  system: {
    tables: { лист: { shape: 'single', columns: [{ key: 'armor', label: 'Класс брони', kind: 'number', default: 10 }] } },
    constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
    effects: {},
  } as unknown as System,
  effect: { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect,

  earlier: [{ id: 'hit', type: 'check', at: 1, title: 'Проверка' }],
};

describe('normalizeDice', () => {
  it('разбирает кириллическую и латинскую нотацию, число опущено → 1', () => {
    expect(normalizeDice('1к8')).toBe('1d8');
    expect(normalizeDice('к8')).toBe('1d8');
    expect(normalizeDice('2d6')).toBe('2d6');
    expect(normalizeDice('2 к 6')).toBe('2d6');
  });
  it('не кости → null', () => {
    expect(normalizeDice('@str')).toBeNull();
  });
});

describe('optionsFor', () => {
  it('собирает поля, входы и результаты; prop без записи не предлагает', () => {
    const groups = new Set(optionsFor(ctx, undefined).map(o => o.group));
    expect(groups).toEqual(new Set(['Поля', 'Входы эффекта', 'Результаты шагов']));
    const withSheets: SlotContext = { ...ctx, sheets: new Map([['цель', 'цель'], ['действующий', 'Кто действует']]) };
    expect(new Set(optionsFor(withSheets, undefined).map(o => o.group))).toContain('Поля: цель');
    expect(optionsFor(withSheets, ['tag']).map(o => o.name)).toEqual(['цель.armor', 'действующий.armor']);
  });
  it('allow сужает список', () => {

    expect(optionsFor(ctx, ['ref']).map(o => o.label)).toEqual([
      'шаг 1 · Проверка — да или нет: проверка пройдена',
      'шаг 1 · Проверка — на сколько перебил порог',
      'шаг 1 · Проверка — сколько вышло всего',
      'шаг 1 · Проверка — что выпало на костях, без прибавок',
      'шаг 1 · Проверка — какая ступень успеха',
      'шаг 1 · Проверка — порог',
      'шаг 1 · Проверка — сколько костей легло максимумом',
      'шаг 1 · Проверка — сколько костей легло единицей',
    ]);
  });
});

describe('ValueField', () => {
  const typeAt = (text: string) => {
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
    return input;
  };

  it('на фокус подсказок нет — они открываются только собачкой', () => {
    render(<ValueField value={undefined} onChange={() => {}} context={ctx} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(document.querySelector('.slot__menu')).toBeNull();
    typeAt('@');
    expect(document.querySelector('.slot__menu')).not.toBeNull();
  });

  it('выбор варианта по @ пишет имя в формулу', () => {
    let got: unknown = 'untouched';
    render(<ValueField value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = typeAt('@Класс');
    fireEvent.mouseDown(screen.getAllByText('Класс брони')[0]!);
    expect(got, 'выбор вставляет фишку, а не закрывает правку').toBe('untouched');
    fireEvent.keyDown(document.querySelector('input.chips__text') ?? input, { key: 'Enter' });
    expect(got).toEqual({ expr: '@armor' });
  });


  it('стрелки двигают подсветку, Enter выбирает подсвеченное', () => {
    let got: unknown = 'untouched';
    render(<ValueField value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = typeAt('@');
    const lit = () => document.querySelector('.slot__option--lit')?.textContent;
    const first = lit();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = lit();
    expect(second).not.toBe(first);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(lit()).toBe(first);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.querySelector('.slot__menu')).toBeNull();
    fireEvent.keyDown([...document.querySelectorAll('input.chips__text')].at(-1)!, { key: 'Enter' });
    expect(got).not.toBe('untouched');
  });

  it('набранное число — тоже формула', () => {
    let got: unknown = 'untouched';
    render(<ValueField value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ expr: '7' });
  });


  it('dice: набранная нотация «1к8» уходит записью кости в формуле', () => {
    let got: unknown = 'untouched';
    render(<ValueField value={undefined} onChange={next => { got = next; }} context={ctx} dice />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '1к8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ expr: '"1d8"' });
  });



  it('пункт «новая вход» зовёт колбэк и коммитит его ref', () => {
    let got: unknown = null;
    render(<ValueField value={undefined} onChange={next => { got = next; }} context={ctx}
      onCreateParam={() => 'новая'} />);
    typeAt('@');
    fireEvent.mouseDown(screen.getByText(/новый вход/));
    fireEvent.keyDown([...document.querySelectorAll('input.chips__text')].at(-1)!, { key: 'Enter' });
    expect(got).toEqual({ expr: '@новая' });
  });
});

describe('ValueField: дописывание после фишки', () => {
  it('набранное после фишки не приклеивается к тегу', () => {
    let value: unknown = { expr: '@сила' };
    const onChange = (next: unknown) => { value = next; };
    const ctxWithField: SlotContext = {
      ...ctx,
      system: { ...ctx.system, tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number', default: 10 }] } } } as never,
    };
    const { rerender } = render(
      <ValueField value={value} onChange={onChange} context={ctxWithField} />,
    );

    for (const step of [' ', ' +', ' + ', ' + 2']) {
      const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
      fireEvent.change(tail, { target: { value: step } });
      rerender(<ValueField value={value} onChange={onChange} context={ctxWithField} />);
    }
    const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
    fireEvent.keyDown(tail, { key: 'Enter' });
    expect(value).toEqual({ expr: '@сила + 2' });
  });
});

describe('фишка дорастает до формулы', () => {
  it('свойство записи тоже, чтобы к нему можно было дописать', () => {
    expect(asText({ expr: '@кость_урона' })).toBe('@кость_урона');
  });

  it('набранное со знака дописывается к тому, что уже стоит', () => {
    expect(grownFrom({ expr: '@кость_урона' }, ' + 2')).toEqual({ expr: '@кость_урона + 2' });
  });

  it('набранное без знака заменяет, а не дописывает', () => {
    expect(grownFrom({ expr: '@кость_урона' }, '7')).toBeNull();
    expect(grownFrom(null, '+ 2')).toBeNull();
  });
});
