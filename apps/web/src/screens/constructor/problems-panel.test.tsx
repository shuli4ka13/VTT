// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { useWorld, emptySystem } from '../../store/world.ts';
import { ProblemsButton } from './problems-panel.tsx';
import type { System } from '@vtt/schema';

const broken = (): System => {
  const system = emptySystem();
  system.effects.thorns = { label: 'Шипы', activation: 'passive', on: [{ on: '', steps: [] }] } as never;
  system.effects.hit = {
    label: 'Удар', activation: 'manual',
    steps: [{ type: 'apply', target: { tag: 'нет_поля' }, value: { expr: '1' } }],
  } as never;
  return system;
};

describe('панель проблем', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: broken(), activeTab: 'sheet', activeEffectId: null, activeStepIndex: null }));
  });
  afterEach(() => { cleanup(); });

  it('считает проблемы и по клику открывает вкладку, эффект и шаг', () => {
    render(<ProblemsButton />);
    const button = screen.getByRole('button', { name: /Проблемы \(\d+\)/ });
    expect(button.textContent).toContain('(');
    fireEvent.click(button);
    const rows = screen.getAllByRole('alert');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const row = rows.find(r => r.textContent?.includes('нет_поля'))!;
    expect(row.textContent).toContain('Эффекты · эффект «Удар» · шаг 1');
    fireEvent.click(row.querySelector('button')!);
    const state = useWorld.getState();
    expect(state.activeTab).toBe('effects');
    expect(state.activeEffectId).toBe('hit');
    expect(state.activeStepIndex).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('без проблем — «Проблемы (0)» и пустая панель', () => {
    useWorld.setState(state => ({ ...state, system: emptySystem() }));
    render(<ProblemsButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Проблемы (0)' }));
    expect(screen.getByText('Проблем нет')).toBeTruthy();
  });
});
