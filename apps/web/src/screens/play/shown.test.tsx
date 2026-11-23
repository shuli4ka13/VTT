// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useRoom } from '../../store/room.ts';
import { useLocale } from '../../store/locale.ts';
import { tableSocket } from '../../api/socket.ts';
import { useSession } from '../../store/session.ts';
import { SheetScreen } from './sheet.tsx';
import type { RoomState } from '@vtt/schema';

const room = (): RoomState => ({
  id: 'к', title: 'Стол', members: [{ userId: 'g', name: 'Ведущий', role: 'gm' }],
  system: {
    id: 'x', name: 'x', effects: {}, langs: ['ru', 'en'],
    tables: {
      вещь: {
        shape: 'book', use: 'item', label: 'Вещь',
        columns: [
          { key: 'провода', label: 'Беспроводной режим', kind: 'boolean', default: false, i18n: { en: { label: 'Wireless mode' } } },
        ],
      },
    },
  },
  compendium: { records: [{ id: 'фонарь', table: 'вещь', label: 'Фонарь', cells: {}, i18n: { en: { label: 'Lantern' } } }] },
  sheets: [{ id: 'а', systemId: 'x', name: 'Арвен', values: {}, effects: [], has: [{ of: 'фонарь' }] }],
} as unknown as RoomState);

describe('игрок читает лист и книгу на своём языке', () => {
  const sets: unknown[][] = [];
  const original = tableSocket.setValue.bind(tableSocket);
  beforeEach(() => {
    sets.length = 0;
    tableSocket.setValue = (...args: unknown[]) => { sets.push(args); };
    useSession.setState(state => ({ ...state, userId: 'g' }));
    useRoom.setState(state => ({ ...state, room: room(), mySheetId: 'а', log: [], error: null }));
  });
  afterEach(() => {
    cleanup();
    tableSocket.setValue = original;
    useLocale.setState({ lang: 'ru', shown: null });
    useSession.setState(state => ({ ...state, userId: '' }));
  });

  it('на языке зрителя en — перевод, на ru — исходная подпись; запись уходит прежним ключом', () => {
    useLocale.setState({ lang: 'ru', shown: 'en' });
    renderOpen(<SheetScreen />);
    expect(screen.getAllByText('Lantern').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Значения'));
    fireEvent.click(screen.getByLabelText('Wireless mode'));
    expect(sets.at(-1)).toEqual(['к', 'а', 'item:фонарь.провода', true]);
    expect(screen.queryByLabelText('Беспроводной режим')).toBeNull();
    cleanup();

    useLocale.setState({ lang: 'ru', shown: 'ru' });
    renderOpen(<SheetScreen />);
    expect(screen.getAllByText('Фонарь').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Значения'));
    expect(screen.getByLabelText('Беспроводной режим')).toBeTruthy();
    expect(screen.queryByLabelText('Wireless mode')).toBeNull();
  });

  it('переключатель языка есть только у системы с несколькими языками', () => {
    renderOpen(<SheetScreen />);
    expect(screen.getByLabelText('язык показа')).toBeTruthy();
    cleanup();
    useRoom.setState(state => ({ ...state, room: { ...room(), system: { ...room().system, langs: undefined } } as unknown as RoomState }));
    renderOpen(<SheetScreen />);
    expect(screen.queryByLabelText('язык показа')).toBeNull();
  });
});
