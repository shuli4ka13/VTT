// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterSection } from './rules/character-section.tsx';
import { useWorld } from '../../store/world.ts';
import { fieldsOf } from '@vtt/engine';

function Sheets() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  return <CharacterSection system={system} editSystem={editSystem} />;
}


describe('колонка персонажа: человеческие теги', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: { лист: { shape: 'single', columns: [{ key: 'field', label: 'Новое поле', kind: 'number' }] } },
        effects: {},
      },
      compendium: { ...state.compendium, records: [] },
      sheets: [],
      activeFieldTag: 'field',
    }));
  });

  it('пока поле девственно, тег следует за названием', () => {
    render(<Sheets />);
    const name = screen.getByPlaceholderText('как зовётся поле');
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
          { key: 'урон', label: 'Урон', kind: 'number' },
          { key: 'field_2', label: 'Итог', expr: { expr: '#урон + 1' } },
        ] } },
      },
      activeFieldTag: 'урон',
    }));
    render(<Sheets />);
    const name = screen.getByPlaceholderText('как зовётся поле');
    fireEvent.change(name, { target: { value: 'Повреждения' } });
    fireEvent.blur(name);
    const field = fieldsOf(useWorld.getState().system)[0]!;
    expect(field.label).toBe('Повреждения');
    expect(field.tag).toBe('урон');
  });
});

describe('блоки листа: папки эффектов на «Листе» не показываются', () => {
  it('пустой блок листа виден, а группа эффектов без полей — нет', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        groups: { Механика: {}, Черты: { parent: 'Механика' } },
        blocks: [{ name: 'Здоровье', parts: [{ table: 'лист' }] }, { name: 'Новый блок', parts: [] }],
        tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number' }] } },
        effects: { крепкий: { label: 'Крепкий', group: 'Черты', activation: 'passive' } },
      },
      activeFieldTag: null,
    }));
    render(<Sheets />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Здоровье');
    expect(text).toContain('Новый блок');
    expect(text).not.toContain('Механика');
    expect(text).not.toContain('Черты');
  });
});
