// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { CharacterSection } from './character-section.tsx';
import type { System } from '@vtt/schema';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

function Sheets() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  return <CharacterSection system={system} editSystem={editSystem} />;
}


const system = (): System => ({
  ...emptySystem(),
  tables: { лист: { shape: 'single', columns: [
    { key: 'hp', label: 'Хиты', kind: 'number', block: 'Здоровье' },
    { key: 'gold', label: 'Золото', kind: 'number', block: 'Богатство' },
  ] } },
} as System);

describe('листы: блоки и типы', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: system(), activeFieldTag: null })); });
  afterEach(() => { cleanup(); });

  it('«+ тип листа» заводит тип, снятая отметка убирает блок с этого типа', () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText('+ тип листа'));
    const [key, kind] = Object.entries(useWorld.getState().system.sheets ?? {})[0]!;
    expect(kind.label).toBe('Новый тип листа');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.sheets?.[key]?.blocks).toEqual(['Здоровье']);
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.sheets?.[key]?.blocks).toBeUndefined();
  });

  it('«+ блок» заводит блок с колонкой, название блока правится на месте', () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText('+ блок'));
    expect(fieldsOf(useWorld.getState().system).some(f => f.group === 'Новый блок')).toBe(true);
    const name = screen.getAllByDisplayValue('Новый блок').find(el => el.tagName === 'INPUT')!;
    fireEvent.change(name, { target: { value: 'Снаряжение' } });
    fireEvent.blur(name);
    expect(fieldsOf(useWorld.getState().system).some(f => f.group === 'Снаряжение')).toBe(true);
  });
});
