// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RulesTab } from './rules/rules-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('колонка персонажа: человеческие теги', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        fields: [{ tag: 'field', label: 'Новое поле', group: 'Блок', value: { kind: 'stored', type: 'number', default: 0 } }],
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
    const field = useWorld.getState().system.fields[0]!;
    expect(field.label).toBe('Урон');
    expect(field.tag).toBe('урон');
  });

  it('на тег с живой ссылкой название больше не влияет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        fields: [
          { tag: 'урон', label: 'Урон', group: 'Блок', value: { kind: 'stored', type: 'number', default: 0 } },
          { tag: 'field_2', label: 'Итог', group: 'Блок', value: { kind: 'formula', expr: '#урон + 1' } },
        ],
      },
      activeFieldTag: 'урон',
    }));
    render(<RulesTab />);
    const name = screen.getByPlaceholderText('как зовётся колонка');
    fireEvent.change(name, { target: { value: 'Повреждения' } });
    fireEvent.blur(name);
    const field = useWorld.getState().system.fields[0]!;
    expect(field.label).toBe('Повреждения');
    expect(field.tag).toBe('урон');
  });
});
