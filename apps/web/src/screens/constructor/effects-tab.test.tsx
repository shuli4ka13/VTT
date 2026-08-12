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

  // Оси висения показываются только тем, кого вешают: активируемый эффект
  // не висит, его «постоянность» — это владение записью, а не длительность.
  it('у активируемого нет «Сколько держится» и есть «Чего стоит»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText('Сколько держится')).toBeNull();
    expect(screen.getByText('Чего стоит')).toBeTruthy();
  });

  it('у пассивного — наоборот: длительность есть, стоимости нет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { poison: { label: 'Хворь', activation: 'passive', modifiers: [] } },
      },
      activeEffectId: 'poison',
    }));
    render(<EffectsTab />);
    expect(screen.getByText('Сколько держится')).toBeTruthy();
    expect(screen.queryByText('Чего стоит')).toBeNull();
  });

  it('палитра — только три кирпича, клик кладёт карточку', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '))
      .map(b => b.textContent!.trim())
      .filter(t => !t.startsWith('+ актив') && !t.startsWith('+ триггер')
        && !t.startsWith('+ пассив') && !t.startsWith('+ брать'));
    expect(palette).toEqual(['+ проверка', '+ изменение', '+ число']);
    fireEvent.click(screen.getByText('+ проверка'));
    expect(screen.getByText('1 · Проверка')).toBeTruthy();
    expect(screen.queryByText(/порог/i)).toBeNull();
  });

  // Домен («атака», «урон») — слова автора: им место в лейблах эффектов и в
  // образцах-донорах. Кнопки же палитры — механика, и говорят только на ней.
  it('кнопки палитры не знают доменных слов', () => {
    render(<EffectsTab />);
    const palette = screen.getAllByRole('button')
      .filter(b => (b.textContent ?? '').trimStart().startsWith('+ '));
    expect(palette.length).toBeGreaterThan(0);
    for (const button of palette) {
      expect(button.textContent).not.toMatch(/атак|спасброс|урон|лечени|заклинан/i);
    }
  });

  it('на экране нет слова «дырка»', () => {
    render(<EffectsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
  });

  it('«Берёт из записи» — видимая секция с кнопкой', () => {
    render(<EffectsTab />);
    expect(screen.getByText('Что эффект берёт из записи')).toBeTruthy();
    fireEvent.click(screen.getByText('+ брать из записи'));
    const effect = useWorld.getState().system.effects.strike!;
    expect(effect.params!.length).toBe(1);
  });
});
