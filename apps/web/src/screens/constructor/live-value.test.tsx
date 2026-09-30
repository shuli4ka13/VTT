// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useWorld, emptySystem } from '../../store/world.ts';
import { RulesTab } from './rules/rules-tab.tsx';
import type { System } from '@vtt/schema';

const system = (): System => ({
  ...emptySystem(),
  tables: { лист: { shape: 'single', columns: [
    { key: 'сила', label: 'Сила', kind: 'number', default: 14, block: 'Характеристики' },
    { key: 'мод', label: 'Модификатор Силы', expr: '(#сила - 10) / 2', block: 'Характеристики' },
  ] } },
} as System);

describe('живое значение под формулой колонки персонажа', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: system(), activeFieldTag: 'мод', activeGroupName: null }));
  });
  afterEach(() => { cleanup(); });

  it('считает формулу на манекене, пересказывает её словами и называет зависимости', () => {
    render(<RulesTab />);
    expect(document.body.textContent).toContain('= 2');
    expect(document.body.textContent).toContain('(Сила - 10) / 2');
    expect(screen.getByText('Зависит от:')).toBeTruthy();
    expect(screen.getAllByText('Сила').length).toBeGreaterThan(0);
  });

  it('правка формулы меняет «= N» сразу', () => {
    render(<RulesTab />);
    expect(document.body.textContent).toContain('= 2');

    act(() => {
      useWorld.getState().editColumn('лист', 'мод', draft => { draft.expr = '#сила + 1'; });
    });
    expect(document.body.textContent).toContain('= 15');
  });

  it('сломанная формула не роняет экран, а показывает прочерк', () => {
    render(<RulesTab />);
    act(() => {
      useWorld.getState().editColumn('лист', 'мод', draft => { draft.expr = '#нет_такого + 1'; });
    });
    expect(document.body.textContent).toContain('= —');
  });
});
