// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { parseTyped, displayOf, optionsFor, SlotInput } from './slot-input.tsx';
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
});
