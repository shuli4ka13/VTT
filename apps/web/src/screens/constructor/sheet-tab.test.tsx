// apps/web/src/screens/constructor/sheet-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SheetTab } from './sheet-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('SheetTab: человеческие теги', () => {
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
    render(<SheetTab />);
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Урон' } });
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
    render(<SheetTab />);
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Повреждения' } });
    const field = useWorld.getState().system.fields[0]!;
    expect(field.label).toBe('Повреждения');
    expect(field.tag).toBe('урон');
  });
});
