// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThingPanel } from './thing-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

describe('тип в снаряжении: что видно в строке и в каком порядке', () => {
  afterEach(cleanup);

  it('снятое свойство уходит в служебные, возвращённое встаёт в конец строки — порядок свойств типа меняется', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, tables: { оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [
        { key: 'урон', label: 'Урон', kind: 'number' }, { key: 'вес', label: 'Вес', kind: 'number' },
      ] } } } as unknown as System,
    }));
    function Live() { return <ThingPanel table="оружие" system={useWorld(state => state.system)} />; }
    render(<Live />);
    const columns = () => useWorld.getState().system.tables!['оружие']!.columns!;
    fireEvent.click(screen.getByLabelText('Урон'));
    expect(columns().map(column => [column.key, column.onSheet])).toEqual([['вес', undefined], ['урон', false]]);
    fireEvent.click(screen.getByLabelText('Урон'));
    expect(columns().map(column => [column.key, column.onSheet])).toEqual([['вес', undefined], ['урон', undefined]]);
  });
});
