// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetSample } from './sheet-sample.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', effects: {},
  tables: {
    лист: { shape: 'single', columns: [{ key: 'монеты', label: 'Монеты', kind: 'number' }] },
    оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [{ key: 'урон', label: 'Урон', kind: 'number' }] },
  },
  pages: [{ name: 'Сумка', lists: ['things'] }],
  blocks: [{ name: 'Деньги', page: 'Сумка', parts: [{ table: 'лист' }] }],
} as unknown as System;

describe('образец листа: сумка из типов вещей и умений', () => {
  afterEach(cleanup);

  it('добавляет образец типа, вписывает его свойства и убирает, книга мира не нужна', () => {
    useWorld.setState(state => ({ ...state, system, compendium: { records: [] }, activePage: null, activeBlock: null }));
    render(<SheetSample system={system} />);
    expect(screen.getByText('У образца пока ничего нет — добавьте образец вещи или умения.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('добавить образец'), { target: { value: 'оружие' } });
    expect(screen.getByText('Оружие (образец)')).toBeTruthy();
    expect(useWorld.getState().system).toBe(system);
    const input = () => screen.getByText('Урон').closest('label')!.querySelector('input')!;
    fireEvent.change(input(), { target: { value: '8' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    expect(input().value).toBe('8');
    fireEvent.click(screen.getByText('убрать из сумки'));
    expect(screen.queryByText('Оружие (образец)')).toBeNull();
  });
});
