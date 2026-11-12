// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderOpen } from '../../testing/render-open.tsx';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useSession } from '../../store/session.ts';
import { SheetScreen, pairFields } from './sheet.tsx';
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

    fireEvent.click([...screen.getByText('Предатор №1').closest('.inline')!.querySelectorAll('.chip')].find(node => node.textContent === '+ ещё один')!);
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
    expect([...document.querySelectorAll('.fold .fold .chip')].map(node => node.textContent)).not.toContain('Лазер');
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

describe('бросок по полю: вторая характеристика и сложность', () => {
  const fabula = JSON.parse(readFileSync(resolve(process.cwd(), '../../samples/fabula.lite.world.json'), 'utf8'));
  const calls: unknown[][] = [];
  const original = tableSocket.rollField.bind(tableSocket);
  const open = (world: { system: unknown; sheets: unknown[]; compendium?: unknown }) => {
    useSession.setState(state => ({ ...state, userId: 'u' }));
    useRoom.setState(state => ({
      ...state, log: [], error: null, mySheetId: (world.sheets[0] as { id: string }).id,
      room: { id: 'к', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }], system: world.system, compendium: world.compendium ?? { records: [] }, sheets: world.sheets } as unknown as RoomState,
    }));
  };
  beforeEach(() => {
    calls.length = 0;
    tableSocket.rollField = (...args: unknown[]) => { calls.push(args); };
  });
  afterEach(() => { cleanup(); tableSocket.rollField = original; });

  it('в Fabula выбор второй характеристики и сложность уходят в бросок', () => {
    open(fabula);
    renderOpen(<SheetScreen />);
    expect(screen.getByText('вторая характеристика:')).toBeTruthy();
    expect(screen.getByText('сложность:')).toBeTruthy();
    const pairs = pairFields(fabula.system);
    expect(pairs.length).toBeGreaterThan(1);
    const [first, other] = [pairs[0]!, pairs[1]!];
    const select = screen.getAllByRole('combobox').find(one => within(one).queryByText('та же')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: other.tag } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '9' } });
    expect(first.tag).not.toBe(other.tag);
    fireEvent.click(screen.getAllByTitle(first.roll!.label ?? `Проверка: ${first.label}`)[0]!);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.slice(2)).toEqual([first.tag, false, [], other.tag, 9]);
  });

  it('в системе без парных правил выбора второй характеристики нет', () => {
    open({ system: { id: 'x', name: 'x', effects: {}, tables: {} }, sheets: [{ id: 'а', systemId: 'x', name: 'Арвен', values: {}, effects: [], has: [] }] });
    renderOpen(<SheetScreen />);
    expect(screen.queryByText('вторая характеристика:')).toBeNull();
    expect(screen.queryByText('сложность:')).toBeNull();
  });
});

describe('висит сейчас: срок словами', () => {
  afterEach(cleanup);

  it('ходы, раунд, минуты, сцена, бой и применения — словами; «повесить…» отдельно', () => {
    const state = room();
    state.system.effects = {
      оглушение: { label: 'Оглушение', activation: 'passive' },
      ярость: { label: 'Ярость', activation: 'passive' },
      джаз: { label: 'Джаз', activation: 'passive' },
      укрытие: { label: 'Укрытие', activation: 'passive' },
      бой: { label: 'Боевой транс', activation: 'passive' },
      заряд: { label: 'Заряд', activation: 'passive' },
      щит: { label: 'Щит', activation: 'passive' },
    } as never;
    state.clock = { round: 3, order: ['а'], active: 'а', sec: 600 };
    state.sheets[0]!.effects = [
      { effectId: 'оглушение', turnsLeft: 2 },
      { effectId: 'ярость', until: 5 },
      { effectId: 'джаз', atSec: 600 + 40 * 60 },
      { effectId: 'укрытие', scene: true },
      { effectId: 'бой', combat: true },
      { effectId: 'заряд', usesLeft: 2 },
    ];
    useSession.setState(s => ({ ...s, userId: 'u' }));
    useRoom.setState(s => ({ ...s, room: state, mySheetId: 'а', log: [], error: null }));
    renderOpen(<SheetScreen />);
    const rows = [...document.querySelectorAll('.hang__row')].map(node => node.textContent);
    expect(rows).toEqual([
      'Оглушениеещё 2 хода×', 'Яростьдо раунда 5×', 'Джазещё 40 мин×',
      'Укрытиедо конца сцены×', 'Боевой трансдо конца боя×', 'Зарядещё 2 применения×',
    ]);
    expect([...document.querySelectorAll('.fold__title')].map(n => n.textContent)).toContain('Повесить…');
    expect(screen.getByText('Щит')).toBeTruthy();
  });

  it('склонение и крупные единицы времени', async () => {
    const { expiryWords, dayTime } = await import('./clock-words.ts');
    expect(expiryWords({ effectId: 'x', turnsLeft: 1 }, null)).toBe('ещё 1 ход');
    expect(expiryWords({ effectId: 'x', turnsLeft: 5 }, null)).toBe('ещё 5 ходов');
    expect(expiryWords({ effectId: 'x', usesLeft: 1 }, null)).toBe('ещё 1 применение');
    expect(expiryWords({ effectId: 'x', atSec: 2 * 86400 }, { round: 0, order: [], active: null })).toBe('ещё 2 дня');
    expect(expiryWords({ effectId: 'x', atSec: 5400 }, { round: 0, order: [], active: null })).toBe('ещё 1 ч 30 мин');
    expect(expiryWords({ effectId: 'x' }, null)).toBeNull();
    expect(dayTime(0)).toBe('День 1, 00:00');
    expect(dayTime(2 * 86400 + 1800)).toBe('День 3, 00:30');
  });
});

describe('списки в блоках листа', () => {
  beforeEach(() => {
    useRoom.setState(state => ({ ...state, log: [], error: null }));
  });
  afterEach(cleanup);

  const NAMES: Record<string, string> = { things: 'Снаряжение', actions: 'Действия', hanging: 'Висит сейчас' };
  const withPages = (lists: Record<string, string[]>, hidden?: string[]) => {
    const state = room();
    const system = state.system as unknown as Record<string, unknown>;
    system.pages = [{ name: 'Шапка', top: true }, ...Object.keys(lists).map(name => ({ name }))];
    const listed = Object.entries(lists).flatMap(([page, on]) => on.map(list => ({ name: NAMES[list]!, page, list, parts: [] })));
    system.blocks = [...((system.blocks as unknown[]) ?? []), ...listed];
    if (hidden) {
      system.sheets = { враг: { label: 'Враг', blocks: listed.map(block => block.name).filter(name => !hidden.includes(name)) } };
      (state.sheets as unknown as Record<string, unknown>[]).forEach(sheet => { sheet.of = 'враг'; });
    }
    useRoom.setState(s => ({ ...s, room: state, mySheetId: 'а' }));
  };

  it('список в блоке уходит из правой панели, остальные остаются', () => {
    withPages({ Сумка: ['things'] });
    renderOpen(<SheetScreen />);
    expect(screen.getAllByText('Снаряжение')).toHaveLength(1);
    expect(screen.getByText('Известные действия')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Сумка' })).toBeTruthy();
    expect(screen.getByText('Снаряжение и действия')).toBeTruthy();
  });

  it('все три списка в блоках — правой панели нет', () => {
    withPages({ Сумка: ['things'], Дела: ['actions', 'hanging'] });
    renderOpen(<SheetScreen />);
    expect(screen.queryByText('Снаряжение и действия')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Сумка' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Дела' }));
    expect(screen.getByText('Известные действия')).toBeTruthy();
  });

  it('блок со списком, скрытый типом листа, не возвращает список в правую панель', () => {
    withPages({ Сумка: ['things'], Дела: ['actions', 'hanging'] }, ['Снаряжение']);
    renderOpen(<SheetScreen />);
    expect(screen.queryByText('Снаряжение и действия')).toBeNull();
    expect(screen.queryByText('Снаряжение')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Сумка' })).toBeNull();
  });
});

