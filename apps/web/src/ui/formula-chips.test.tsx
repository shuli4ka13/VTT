// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormulaChips, partsOf, joinParts } from './formula-chips.tsx';
import type { System } from '@vtt/schema';

const system = {
  fields: [
    { tag: 'бонус_атаки', label: 'Бонус атаки', value: { kind: 'formula', expr: '1' } },
    { tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  constants: {}, effects: {},
} as unknown as System;

describe('partsOf / joinParts', () => {
  it('раскладывает текст и теги и собирает обратно без потерь', () => {
    const value = '1d20 + @бонус_атаки + 2';
    const parts = partsOf(value);
    expect(parts).toEqual([{ text: '1d20 + ' }, { tag: 'бонус_атаки' }, { text: ' + 2' }]);
    expect(joinParts(parts)).toBe(value);
  });

  it('пустая строка — один пустой текст', () => {
    expect(partsOf('')).toEqual([{ text: '' }]);
  });
});

describe('FormulaChips', () => {
  it('тег рисуется фишкой с человеческим названием, латиница не видна', () => {
    render(<FormulaChips value="1d20 + @бонус_атаки" system={system} onChange={() => {}} />);
    expect(screen.getByText('Бонус атаки')).toBeTruthy();
    expect(screen.queryByDisplayValue(/бонус_атаки/)).toBeNull();
  });

  it('набрал @бон — подсказка по названию, клик вставляет тег в данные', () => {
    let value = '1d20 + @бон';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    const input = screen.getByDisplayValue('1d20 + @бон') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(value.length, value.length);
    fireEvent.click(input);
    fireEvent.mouseDown(screen.getByText('Бонус атаки'));
    expect(value).toBe('1d20 + @бонус_атаки');
  });

  it('крестик на фишке убирает тег целиком', () => {
    let value = '1d20 + @бонус_атаки + 2';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    fireEvent.mouseDown(screen.getByLabelText('убрать поле'));
    expect(value).toBe('1d20 +  + 2');
  });

  it('калькулятор виден в фокусе и вставляет операцию в позицию курсора', () => {
    let value = '2 + 2';
    render(<FormulaChips value={value} system={system} calculator onChange={next => { value = next; }} />);
    expect(screen.queryByText('округлить вниз')).toBeNull();
    const input = screen.getByDisplayValue('2 + 2') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.click(input);
    fireEvent.mouseDown(screen.getByText('округлить вниз'));
    expect(value).toBe('floor()2 + 2');
  });

  it('без флага calculator ряда операций нет и в фокусе', () => {
    render(<FormulaChips value="2 + 2" system={system} onChange={() => {}} />);
    const input = screen.getByDisplayValue('2 + 2') as HTMLInputElement;
    input.focus();
    fireEvent.click(input);
    expect(screen.queryByText('модуль')).toBeNull();
  });

  it('backspace в начале куска съедает фишку слева', () => {
    let value = '@сила + 2';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    const tail = screen.getAllByRole('textbox')[1] as HTMLInputElement;
    expect(tail.value).toBe(' + 2');
    tail.focus();
    tail.setSelectionRange(0, 0);
    fireEvent.keyDown(tail, { key: 'Backspace' });
    expect(value).toBe(' + 2');
  });
});
