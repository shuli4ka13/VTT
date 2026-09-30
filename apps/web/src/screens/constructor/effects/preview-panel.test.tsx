// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { PreviewPanel } from './preview-panel.tsx';
import type { System } from '@vtt/schema';

const system = (): System => ({
  ...emptySystem(),
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } },
  constants: { к6: { label: 'Кость урона', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [],
      steps: [
        { id: 'число', type: 'amount', source: 'roll', dice: { constant: 'к6' } },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@число' } },
      ],
    },
    щит: { label: 'Щит', activation: 'passive', modifiers: [] },
  },
} as unknown as System);

describe('проба на манекене', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: system() })); });
  afterEach(() => { cleanup(); });

  it('показывает журнал, изменение поля и сам лист манекена', () => {
    render(<PreviewPanel effectId="удар" />);
    fireEvent.click(screen.getByText('Проба'));

    const shown = () => document.body.textContent ?? '';
    expect(shown()).toContain('А применяет «Удар» по Б');
    expect(shown()).toContain('Хиты: 20 → 16');
    expect(shown()).toContain('манекен');
  });

  it('кость выбирается: минимум и максимум дают разные числа', () => {
    render(<PreviewPanel effectId="удар" />);
    fireEvent.click(screen.getByText('Проба'));

    const dice = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'max'))!;

    fireEvent.change(dice, { target: { value: 'max' } });
    expect(document.body.textContent).toContain('Хиты: 20 → 14');

    fireEvent.change(dice, { target: { value: 'min' } });
    expect(document.body.textContent).toContain('Хиты: 20 → 19');
  });

  it('у висящего эффекта проба отказывается словами, а не молчит', () => {
    render(<PreviewPanel effectId="щит" />);
    fireEvent.click(screen.getByText('Проба'));
    expect(screen.getByRole('alert').textContent).toContain('висит на листе');
  });

  it('пока эффект не выбран, проба просит выбрать', () => {
    render(<PreviewPanel effectId={null} />);
    fireEvent.click(screen.getByText('Проба'));
    expect(screen.getByText('Выберите эффект')).toBeTruthy();
  });
});
