// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { parseTyped, displayOf, optionsFor, SlotInput, normalizeDice, asText, grownFrom } from './slot-input.tsx';
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

describe('parseTyped', () => {
  it('пусто → null, число → const, текст → expr', () => {
    expect(parseTyped('')).toBeNull();
    expect(parseTyped('3')).toEqual({ const: 3 });
    expect(parseTyped('@armor + 2')).toEqual({ expr: '@armor + 2' });
  });
});

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

describe('displayOf', () => {
  it('структурные ссылки показываются словами', () => {
    expect(displayOf({ tag: 'armor' }, ctx)).toBe('поле: Класс брони');
    expect(displayOf({ param: 'p_1' }, ctx)).toBe('из записи: кость урона');
    expect(displayOf({ ref: 'hit.margin' }, ctx)).toBe('шаг 1 · Проверка — на сколько перебил порог');
    expect(displayOf({ const: 5 }, ctx)).toBe('5');
  });
});

describe('optionsFor', () => {
  it('собирает поля, запись, результаты и кости; prop не предлагает', () => {
    const groups = new Set(optionsFor(ctx).map(o => o.group));
    expect(groups).toEqual(new Set(['Поля цели', 'Из записи', 'Результаты шагов', 'Кости']));
  });
  it('allow сужает список', () => {

    expect(optionsFor(ctx, ['ref']).map(o => o.label)).toEqual([
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

  it('выбор варианта по @ отдаёт структурную ссылку', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    typeAt('@Класс');
    fireEvent.mouseDown(screen.getAllByText('Класс брони')[0]!);
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
    expect(got).not.toBe('untouched');
    expect(document.querySelector('.slot__menu')).toBeNull();
  });

  it('набранное число уходит как const по Enter', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
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

  it('allow сужает набранный текст: чужой вид отменяется, фишка остаётся', () => {
    let called = false;
    render(<SlotInput value={{ tag: 'armor' }} onChange={() => { called = true; }} context={ctx} allow={['constant']} />);

    expect(screen.getByText('Класс брони')).toBeTruthy();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(called).toBe(false);
    expect(screen.getByText('Класс брони')).toBeTruthy();
  });

  it('крестик на фишке очищает слот', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={{ tag: 'armor' }} onChange={next => { got = next; }} context={ctx} />);
    fireEvent.mouseDown(screen.getByLabelText('убрать'));
    expect(got).toBeNull();
  });

  it('пункт «новая потребность» зовёт колбэк и коммитит его ref', () => {
    let got: unknown = null;
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx}
      onCreateFromRecord={() => ({ param: 'новая' })} />);
    typeAt('@');
    fireEvent.mouseDown(screen.getByText(/новая потребность/));
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
  const ctx = {
    system: {
      fields: [{ tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 10 } }],
      effects: {}, records: {},
    },
    effect: { label: 'Удар' },
    earlier: [],
  } as never;

  it('поле листа превращается в текст формулы', () => {
    expect(asText({ tag: 'сила' }, ctx)).toBe('@сила');
  });

  it('свойство записи тоже, чтобы к нему можно было дописать', () => {
    expect(asText({ prop: 'кость_урона' }, ctx)).toBe('@кость_урона');
  });

  it('набранное со знака дописывается к тому, что уже стоит', () => {
    expect(grownFrom({ prop: 'кость_урона' }, ' + 2', ctx)).toEqual({ expr: '@кость_урона + 2' });
    expect(grownFrom({ tag: 'сила' }, '* 2', ctx)).toEqual({ expr: '@сила * 2' });
  });

  it('набранное без знака заменяет, а не дописывает', () => {
    expect(grownFrom({ prop: 'кость_урона' }, '7', ctx)).toBeNull();
    expect(grownFrom(null, '+ 2', ctx)).toBeNull();
  });
});
