// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { SheetScreen } from './sheet.tsx';
import type { RoomState } from '@vtt/schema';

const room = (): RoomState => ({
  id: 'к', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }],
  system: {
    id: 'x', name: 'x', effects: {},
    tables: {
      оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [] },
      мод: { shape: 'book', use: 'item', label: 'Мод', columns: [] },
    },
  },
  compendium: { records: [
    { id: 'предатор', table: 'оружие', label: 'Предатор', cells: {} },
    { id: 'лазер', table: 'мод', label: 'Лазер', cells: {} },
  ] },
  sheets: [{ id: 'а', systemId: 'x', name: 'Арвен', values: {}, effects: [], has: [
    { of: 'предатор' }, { of: 'предатор', id: 'п2' }, { of: 'лазер', in: 'п2' },
  ] }],
} as unknown as RoomState);

describe('сумка: экземпляры вещей', () => {
  const calls: unknown[][] = [];
  const original = tableSocket.setBelonging.bind(tableSocket);
  beforeEach(() => {
    calls.length = 0;
    tableSocket.setBelonging = (...args: unknown[]) => { calls.push(args); };
    useRoom.setState(state => ({ ...state, room: room(), mySheetId: 'а', log: [], error: null }));
  });
  afterEach(() => { cleanup(); tableSocket.setBelonging = original; });

  it('два одинаковых ствола видны по отдельности; убрать, добавить ещё один и поставить мод — по экземпляру', () => {
    renderOpen(<SheetScreen />);
    expect(screen.getByText('Предатор №1')).toBeTruthy();
    expect(screen.getByText('Предатор №2')).toBeTruthy();

    fireEvent.click(screen.getAllByText('✕ убрать')[1]!);
    expect(calls.at(-1)).toEqual(['к', 'а', 'has', 'предатор', false, undefined, { inst: 'п2' }]);

    fireEvent.click(screen.getByText(/Предатор · \+ ещё один/));
    expect(calls.at(-1)).toEqual(['к', 'а', 'has', 'предатор', true, false, { add: true }]);

    const laser = screen.getByText('Лазер').closest('div')!.parentElement!;
    const select = [...document.querySelectorAll('select')].find(node => (node as HTMLSelectElement).value === 'п2') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(laser).toBeTruthy();
    fireEvent.change(select, { target: { value: 'предатор' } });
    expect(calls.at(-1)).toEqual(['к', 'а', 'has', 'лазер', true, false, { inst: 'лазер', in: 'предатор' }]);
  });
});
