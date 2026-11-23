// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormulaChips } from './formula-chips.tsx';
import { useLocale } from '../store/locale.ts';
import type { System } from '@vtt/schema';

const system = { id: 'x', name: 'x', effects: {}, tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] } } } as unknown as System;

const DATA = 'if(1 > 0 and not false, floor(7 / 2), max(1, 2d6))';

describe('письмо формул: данные одни, показ — на языке экрана', () => {
  afterEach(() => { cleanup(); useLocale.setState({ lang: 'ru' }); });

  it('по-русски поле показывает русские слова и кость через «к»', () => {
    render(<FormulaChips value={DATA} system={system} onChange={() => {}} />);
    expect(screen.getByDisplayValue('если(1 > 0 и не нет, округлить вниз(7 / 2), большее из(1, 2к6))')).toBeTruthy();
  });

  it('по-английски та же формула показана нейтральными словами', () => {
    useLocale.setState({ lang: 'en' });
    render(<FormulaChips value={DATA} system={system} onChange={() => {}} />);
    expect(screen.getByDisplayValue(DATA)).toBeTruthy();
  });

  it('набранное по-русски и по-английски уходит в данные одной записью', () => {
    const sent: string[] = [];
    render(<FormulaChips value="" system={system} onChange={next => { sent.push(next); }} />);
    const input = document.querySelector('input.chips__text') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'если(1 > 0, 2к6, 0)' } });
    fireEvent.change(input, { target: { value: 'if(1 > 0, 2d6, 0)' } });
    expect(sent).toEqual(['if(1 > 0, 2d6, 0)', 'if(1 > 0, 2d6, 0)']);
  });
});
