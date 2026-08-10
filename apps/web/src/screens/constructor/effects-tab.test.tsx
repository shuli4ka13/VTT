// apps/web/src/screens/constructor/effects-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('EffectsTab: палитра трёх понятий', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } },
      },
      activeEffectId: 'strike',
    }));
  });

  it('заготовка «атака с броском» кладёт две карточки', () => {
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('+ атака с броском'));
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.getByText('2 · Изменение')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  it('на экране нет слова «дырка»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
  });
});
