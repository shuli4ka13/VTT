// apps/web/src/screens/constructor/dictionaries.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';

const openDictionaries = () => {
  render(<EffectsTab />);
  fireEvent.click(screen.getByText('Словари'));
};

describe('Словари: кости, мишени бросков, таблицы, типы действий', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: emptySystem(),
      activeEffectId: null,
    }));
  });

  it('кость заводится и попадает в словарь системы', () => {
    openDictionaries();
    fireEvent.click(screen.getByText('+ кость'));
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies.some(c => c.kind === 'die')).toBe(true);
  });

  // Тег рождается заготовкой («бросок»), но пока запись не встретилась
  // нигде в мире — следует за лейблом при наборе (тот же приём, что и у
  // тега поля в sheet-tab.tsx). Реальный ввод в Input, не прямая правка стора.
  it('мишень броска заводится с тегом из названия', () => {
    openDictionaries();
    fireEvent.click(screen.getByText('+ мишень'));
    const input = screen.getByPlaceholderText('название мишени');
    fireEvent.change(input, { target: { value: 'Бросок защиты' } });
    const rolls = useWorld.getState().system.rolls ?? [];
    expect(rolls[0]).toEqual({ tag: 'бросок_защиты', label: 'Бросок защиты' });
  });

  it('таблица по диапазонам заводится в словарь системы', () => {
    openDictionaries();
    fireEvent.click(screen.getByText('+ таблица'));
    const tables = Object.values(useWorld.getState().system.tables ?? {});
    expect(tables.length).toBe(1);
  });

  it('таблицу, на которую ссылается поле, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { proficiency: { label: 'Бонус мастерства', ranges: [{ from: 1, to: 4, value: 2 }] } },
        fields: [{ tag: 'pb', label: 'Бонус мастерства', value: { kind: 'table', table: 'proficiency', arg: '#level' } }],
      },
      activeEffectId: null,
    }));
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('Словари'));
    const guarded = screen.getByTitle('таблица используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('тип действия заводится в словарь системы', () => {
    openDictionaries();
    fireEvent.click(screen.getByText('+ тип'));
    const types = Object.values(useWorld.getState().system.action_types ?? {});
    expect(types.length).toBe(1);
  });

  it('тип действия, которым платит эффект, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        action_types: { action: { label: 'Действие' } },
        effects: { strike: { label: 'Атака', activation: 'manual', cost: 'action', params: [], steps: [] } },
      },
      activeEffectId: null,
    }));
    render(<EffectsTab />);
    fireEvent.click(screen.getByText('Словари'));
    const guarded = screen.getByTitle('тип используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });
});
