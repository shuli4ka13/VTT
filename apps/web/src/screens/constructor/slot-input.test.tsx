// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { parseTyped, displayOf, optionsFor, SlotInput, normalizeDice } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';
import type { System, Effect } from '@vtt/schema';

const ctx: SlotContext = {
  system: {
    fields: [{ tag: 'armor', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
    constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
    effects: {},
  } as unknown as System,
  effect: { params: [{ key: 'p_1', label: 'кость урона', kind: 'dice' }] } as unknown as Effect,
  earlier: ['hit'],
};

describe('parseTyped', () => {
  it('пусто → null, число → const, текст → expr', () => {
    expect(parseTyped('')).toBeNull();
    expect(parseTyped('3')).toEqual({ const: 3 });
    expect(parseTyped('#armor + 2')).toEqual({ expr: '#armor + 2' });
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
    expect(normalizeDice('#str')).toBeNull();
  });
});

describe('displayOf', () => {
  it('структурные ссылки показываются словами', () => {
    expect(displayOf({ tag: 'armor' }, ctx)).toBe('поле: Класс брони');
    expect(displayOf({ param: 'p_1' }, ctx)).toBe('из записи: кость урона');
    expect(displayOf({ ref: 'hit' }, ctx)).toBe('результат «hit»');
    expect(displayOf({ const: 5 }, ctx)).toBe('5');
  });
});

describe('optionsFor', () => {
  it('собирает поля, запись, результаты и кости; prop не предлагает', () => {
    const groups = new Set(optionsFor(ctx).map(o => o.group));
    expect(groups).toEqual(new Set(['Поля цели', 'Из записи', 'Результаты шагов', 'Кости']));
  });
  it('allow сужает список', () => {
    expect(optionsFor(ctx, ['ref']).map(o => o.label)).toEqual(['результат «hit»']);
  });
});

describe('SlotInput', () => {
  it('клик по варианту отдаёт структурную ссылку', () => {
    let got: unknown = 'untouched';
    render(<SlotInput value={undefined} onChange={next => { got = next; }} context={ctx} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('Класс брони'));
    expect(got).toEqual({ tag: 'armor' });
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
    // Ссылка стоит фишкой; набранное поверх неё чужого вида — отменяется.
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
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText(/новая потребность/));
    expect(got).toEqual({ param: 'новая' });
  });
});

describe('SlotInput: дописывание после фишки', () => {
  it('набранное после фишки не приклеивается к тегу', () => {
    let value: unknown = { expr: '#сила' };
    const onChange = (next: unknown) => { value = next; };
    const ctxWithField: SlotContext = {
      ...ctx,
      system: { ...ctx.system, fields: [{ tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 10 } }] } as never,
    };
    const { rerender } = render(
      <SlotInput value={value} onChange={onChange} context={ctxWithField} />,
    );
    // Дописываем посимвольно, как человек: каждый ввод — новая перерисовка,
    // и текст обязан копиться, а не склеиваться с тегом.
    for (const step of [' ', ' +', ' + ', ' + 2']) {
      const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
      fireEvent.change(tail, { target: { value: step } });
      rerender(<SlotInput value={value} onChange={onChange} context={ctxWithField} />);
    }
    const tail = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
    fireEvent.keyDown(tail, { key: 'Enter' });
    expect(value).toEqual({ expr: '#сила + 2' });
  });
});
