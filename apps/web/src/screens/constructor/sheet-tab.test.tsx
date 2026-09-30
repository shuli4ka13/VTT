// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RulesTab } from './rules/rules-tab.tsx';
import { useWorld } from '../../store/world.ts';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

describe('колонка персонажа: человеческие теги', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: { лист: { shape: 'single', columns: [{ key: 'field', label: 'Новое поле', kind: 'number', block: 'Блок' }] } },
        effects: {},
      },
      compendium: { ...state.compendium, records: [] },
      sheets: [],
      activeFieldTag: 'field',
    }));
  });

  it('пока поле девственно, тег следует за названием', () => {
    render(<RulesTab />);
    const name = screen.getByPlaceholderText('как зовётся колонка');
    fireEvent.change(name, { target: { value: 'Урон' } });
    fireEvent.blur(name);
    const field = fieldsOf(useWorld.getState().system)[0]!;
    expect(field.label).toBe('Урон');
    expect(field.tag).toBe('урон');
  });

  it('на тег с живой ссылкой название больше не влияет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: { лист: { shape: 'single', columns: [
          { key: 'урон', label: 'Урон', kind: 'number', block: 'Блок' },
          { key: 'field_2', label: 'Итог', expr: '#урон + 1', block: 'Блок' },
        ] } },
      },
      activeFieldTag: 'урон',
    }));
    render(<RulesTab />);
    const name = screen.getByPlaceholderText('как зовётся колонка');
    fireEvent.change(name, { target: { value: 'Повреждения' } });
    fireEvent.blur(name);
    const field = fieldsOf(useWorld.getState().system)[0]!;
    expect(field.label).toBe('Повреждения');
    expect(field.tag).toBe('урон');
  });
});
