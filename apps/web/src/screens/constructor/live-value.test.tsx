// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useWorld, emptySystem } from '../../store/world.ts';
import { RulesTab } from './rules/rules-tab.tsx';
import type { System } from '@vtt/schema';

const system = (): System => ({
  ...emptySystem(),
  fields: [
    { tag: 'сила', label: 'Сила', group: 'Характеристики', value: { kind: 'stored', type: 'number', default: 14 } },
    { tag: 'мод', label: 'Модификатор Силы', group: 'Характеристики', value: { kind: 'formula', expr: '(#сила - 10) / 2' } },
  ],
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
      useWorld.getState().editField('мод', draft => {
        if (draft.value.kind === 'formula') draft.value.expr = '#сила + 1';
      });
    });
    expect(document.body.textContent).toContain('= 15');
  });

  it('сломанная формула не роняет экран, а показывает прочерк', () => {
    render(<RulesTab />);
    act(() => {
      useWorld.getState().editField('мод', draft => {
        if (draft.value.kind === 'formula') draft.value.expr = '#нет_такого + 1';
      });
    });
    expect(document.body.textContent).toContain('= —');
  });
});
