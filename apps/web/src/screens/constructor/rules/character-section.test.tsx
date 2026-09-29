// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { RulesTab } from './rules-tab.tsx';
import type { System } from '@vtt/schema';

const system = (): System => ({
  ...emptySystem(),
  fields: [
    { tag: 'hp', label: 'Хиты', group: 'Здоровье', value: { kind: 'stored', type: 'number', default: 0 } },
    { tag: 'gold', label: 'Золото', group: 'Богатство', value: { kind: 'stored', type: 'number', default: 0 } },
  ],
} as System);

describe('листы: блоки и типы', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: system(), activeFieldTag: null })); });
  afterEach(() => { cleanup(); });

  it('«+ тип листа» заводит тип, снятая отметка убирает блок с этого типа', () => {
    render(<RulesTab />);
    fireEvent.click(screen.getByText('+ тип листа'));
    const [key, kind] = Object.entries(useWorld.getState().system.records ?? {})[0]!;
    expect(kind.kind).toBe('sheet');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.records?.[key]?.blocks).toEqual(['Здоровье']);
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.records?.[key]?.blocks).toBeUndefined();
  });

  it('«+ блок» заводит блок с колонкой, название блока правится на месте', () => {
    render(<RulesTab />);
    fireEvent.click(screen.getByText('+ блок'));
    expect(useWorld.getState().system.fields.some(f => f.group === 'Новый блок')).toBe(true);
    const name = screen.getByDisplayValue('Новый блок');
    fireEvent.change(name, { target: { value: 'Снаряжение' } });
    fireEvent.blur(name);
    expect(useWorld.getState().system.fields.some(f => f.group === 'Снаряжение')).toBe(true);
  });
});
