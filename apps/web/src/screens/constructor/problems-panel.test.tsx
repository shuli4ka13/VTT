// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { useWorld, emptySystem } from '../../store/world.ts';
import { ProblemsButton, problemsWord } from './problems-panel.tsx';
import type { System } from '@vtt/schema';

const broken = (): System => {
  const system = emptySystem();
  system.effects.thorns = { label: 'Шипы', activation: 'passive', on: [{ on: '', steps: [] }] } as never;
  system.effects.hit = {
    label: 'Удар', activation: 'manual', params: [{ key: 'цель', kind: 'sheet' }],
    steps: [{ type: 'apply', target: { expr: '@цель.нет_поля' }, value: { expr: '1' } }],
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
    const button = screen.getByRole('button', { name: /Проблемы: \d+ (ошиб|замеч)/ });
    expect(button.textContent).toMatch(/\d+ ошиб/);
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

  it('без проблем — «Проблем нет» и пустая панель', () => {
    useWorld.setState(state => ({ ...state, system: emptySystem() }));
    render(<ProblemsButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Проблем нет' }));
    expect(screen.getByRole('dialog').querySelector('.empty')).toBeTruthy();
  });

  it('склоняет ошибки и замечания раздельно', () => {
    expect(problemsWord(2, 3)).toBe('Проблемы: 2 ошибки, 3 замечания');
    expect(problemsWord(1, 0)).toBe('Проблемы: 1 ошибка');
    expect(problemsWord(0, 5)).toBe('Проблемы: 5 замечаний');
    expect(problemsWord(11, 21)).toBe('Проблемы: 11 ошибок, 21 замечание');
    expect(problemsWord(0, 0)).toBe('Проблем нет');
  });
});
