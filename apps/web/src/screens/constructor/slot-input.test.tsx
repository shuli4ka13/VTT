// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { optionsFor, SlotInput, normalizeDice, asText, grownFrom } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';
import type { System, Effect } from '@vtt/schema';

const ctx: SlotContext = {
  system: {
    fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
    constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
    effects: {},
  } as unknown as System,
  effect: { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect,

  earlier: [{ id: 'hit', type: 'threshold', at: 1, title: 'Проверка' }],
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
  it('собирает поля, запись, результаты и кости; prop не предлагает', () => {
    const groups = new Set(optionsFor(ctx, undefined, []).map(o => o.group));
    expect(groups).toEqual(new Set(['Поля листа', 'Входы эффекта', 'Результаты шагов', 'Кости']));
    expect(new Set(optionsFor(ctx, undefined, [], 'target').map(o => o.group))).toContain('Поля цели');
    expect(optionsFor(ctx, ['tag'], [], 'target')[0]!.name).toBe('получатель.armor');
  });
  it('allow сужает список', () => {

    expect(optionsFor(ctx, ['ref'], []).map(o => o.label)).toEqual([
      'шаг 1 · Проверка — да или нет: взят ли порог',
      'шаг 1 · Проверка — на сколько перебил порог',
      'шаг 1 · Проверка — сколько вышло всего, с прибавками',
      'шаг 1 · Проверка — что выпало на костях, без прибавок',
      'шаг 1 · Проверка — какая ступень успеха',
      'шаг 1 · Проверка — сколько костей бросили',
      'шаг 1 · Проверка — сколько костей легло максимумом',
      'шаг 1 · Проверка — сколько костей легло единицей',
      'шаг 1 · Проверка — да или нет: бросок правили',
      'шаг 1 · Проверка — сколько вышло у второй стороны: порог или встречный бросок',
      'шаг 1 · Проверка — встречный бросок — что выпало на костях',
    ]);
  });
});

describe('SlotInput', () => {
  const typeAt = (text: string) => {
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
    return input;
  };

  it('на фокус подсказок нет — они открываются только собачкой', () => {
    render(<SlotInput value={undefined} onChange={() => {}} context={ctx} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(document.querySelector('.slot__menu')).toBeNull();
    typeAt('@');
    expect(document.querySelector('.slot__menu')).not.toBeNull();
  });

  it('выбор варианта по @ пишет имя в формулу', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = typeAt('@Класс');
    fireEvent.mouseDown(screen.getAllByText('Класс брони')[0]!);
    expect(got, 'выбор вставляет фишку, а не закрывает правку').toBe('untouched');
    fireEvent.keyDown(document.querySelector('input.chips__text') ?? input, { key: 'Enter' });
    expect(got).toEqual({ expr: '@armor' });
  });

  it('где имя — само значение (какое поле менять), выбор отдаёт ссылку на поле', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} allow={['tag', 'param']} keep={['tag', 'param']} />);
    const input = typeAt('@Класс');
    fireEvent.mouseDown(screen.getAllByText('Класс брони')[0]!);
    fireEvent.keyDown(document.querySelector('input.chips__text') ?? input, { key: 'Enter' });
    expect(got).toEqual({ tag: 'armor' });
  });

  it('стрелки двигают подсветку, Enter выбирает подсвеченное', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
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
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ expr: '7' });
  });

  it('в аргументе вызова число остаётся значением', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} keep={['const']} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ const: 7 });
  });

  it('dice: набранная нотация «1к8» уходит как const NdM по Enter', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} dice />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '1к8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(got).toEqual({ const: '1d8' });
  });

  it('крестик на фишке очищает слот', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={{ tag: 'armor' }} onChange={next => { got = next; }} context={ctx} />);
    fireEvent.mouseDown(screen.getByLabelText('убрать поле'));
    fireEvent.keyDown(screen.getAllByRole('textbox').at(-1)!, { key: 'Enter' });
    expect(got).toBeNull();
  });

  it('значение с именем показано той же фишкой, что и в строке формул, — без второй фишки', () => {
    render(<SlotInput value={{ tag: 'armor' }} onChange={() => {}} context={ctx} />);
    expect(screen.getAllByText('Класс брони')).toHaveLength(1);
    expect(screen.queryByLabelText('убрать')).toBeNull();
  });

  it('пункт «новая вход» зовёт колбэк и коммитит его ref', () => {
    let got: unknown = null;
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx}
      onCreateFromRecord={() => ({ param: 'новая' })} />);
    typeAt('@');
    fireEvent.mouseDown(screen.getByText(/новый вход/));
    fireEvent.keyDown([...document.querySelectorAll('input.chips__text')].at(-1)!, { key: 'Enter' });
    expect(got).toEqual({ param: 'новая' });
  });
});

describe('SlotInput: дописывание после фишки', () => {
  it('набранное после фишки не приклеивается к тегу', () => {
    let value: unknown = { expr: '@сила' };
    const onChange = (next: unknown) => { value = next; };
    const ctxWithField: SlotContext = {
      ...ctx,
      system: { ...ctx.system, fields: [{ tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 10 } }] } as never,
    };
    const { rerender } = render(
      <SlotInput value={value} onChange={onChange} context={ctxWithField} />,
    );

    for (const step of [' ', ' +', ' + ', ' + 2']) {
      const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
      fireEvent.change(tail, { target: { value: step } });
      rerender(<SlotInput value={value} onChange={onChange} context={ctxWithField} />);
    }
    const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
    fireEvent.keyDown(tail, { key: 'Enter' });
    expect(value).toEqual({ expr: '@сила + 2' });
  });
});

describe('фишка дорастает до формулы', () => {
  it('поле листа превращается в текст формулы', () => {
    expect(asText({ tag: 'сила' })).toBe('@сила');
  });

  it('свойство записи тоже, чтобы к нему можно было дописать', () => {
    expect(asText({ prop: 'кость_урона' })).toBe('@кость_урона');
  });

  it('набранное со знака дописывается к тому, что уже стоит', () => {
    expect(grownFrom({ prop: 'кость_урона' }, ' + 2')).toEqual({ expr: '@кость_урона + 2' });
    expect(grownFrom({ tag: 'сила' }, '* 2')).toEqual({ expr: '@сила * 2' });
  });

  it('набранное без знака заменяет, а не дописывает', () => {
    expect(grownFrom({ prop: 'кость_урона' }, '7')).toBeNull();
    expect(grownFrom(null, '+ 2')).toBeNull();
  });
});
