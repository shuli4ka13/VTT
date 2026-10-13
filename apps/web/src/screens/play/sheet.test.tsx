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

    const laser = screen.getAllByText('Лазер')[0]!.closest('div')!.parentElement!;
    const select = [...document.querySelectorAll('select')].find(node => (node as HTMLSelectElement).value === 'п2') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(laser).toBeTruthy();
    fireEvent.change(select, { target: { value: 'предатор' } });
    expect(calls.at(-1)).toEqual(['к', 'а', 'has', 'лазер', true, false, { inst: 'лазер', in: 'предатор' }]);
  });
});

describe('сумка: добавить вещь', () => {
  beforeEach(() => {
    const state = room();
    state.system.tables = {
      ...state.system.tables,
      оружие: { ...state.system.tables!['оружие']!, block: 'Снаряжение' },
      мод: { ...state.system.tables!['мод']!, block: 'Снаряжение' },
      имплант: { shape: 'book', use: 'item', label: 'Имплант', block: 'Импланты', columns: [] },
    } as never;
    state.compendium.records.push({ id: 'глаза', table: 'имплант', label: 'Киберглаза', cells: {} } as never);
    useRoom.setState(s => ({ ...s, room: state, mySheetId: 'а', log: [], error: null }));
  });
  afterEach(cleanup);

  it('по блокам типа записи, поиск по названию оставляет только найденное', () => {
    renderOpen(<SheetScreen />);
    const titles = () => [...document.querySelectorAll('.fold__title')].map(node => node.textContent);
    expect(titles()).toEqual(expect.arrayContaining(['Снаряжение', 'Импланты']));
    expect(screen.getByText('Киберглаза')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('найти по названию'), { target: { value: 'глаз' } });
    expect(screen.getByText('Киберглаза')).toBeTruthy();
    expect([...document.querySelectorAll('.chip')].map(node => node.textContent)).not.toContain('Лазер');
    expect(titles().filter(one => one === 'Импланты')).toHaveLength(1);
    expect((screen.getByText('Импланты').closest('details') as HTMLDetailsElement).open).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('найти по названию'), { target: { value: 'ничего такого' } });
    expect(screen.getByText('Ничего не нашлось.')).toBeTruthy();
  });
});

describe('заявки к броску с листа', () => {
  it('предлагаются слова словаря правок и метки, которые заявляет игрок', async () => {
    const { claimWords } = await import('./sheet.tsx');
    const system = {
      id: 'x', name: 'x', effects: {},
      roll_edits: { wild: { label: 'Дикий кубик', ops: [{ op: 'wild' }] } },
      tables: { rolls: { label: 'Броски', key: 'word', columns: [{ key: 'claim', label: 'Заявляет игрок', kind: 'boolean' }], rows: [
        { value: 'проверка' }, { value: 'зрение', cells: { claim: true } }, { value: 'голос', cells: { claim: true } },
      ] } },
    } as never;
    expect(claimWords(system)).toEqual([['wild', 'Дикий кубик'], ['зрение', 'зрение'], ['голос', 'голос']]);
  });
});
