// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderOpen } from '../../testing/render-open.tsx';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useSession } from '../../store/session.ts';
import { SheetScreen, pairFields } from './sheet.tsx';
import { pickCombo, comboOptions } from '../../testing/cards.ts';
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
    const select = [...document.querySelectorAll<HTMLElement>('[role="combobox"]')].find(node => node.dataset.value === 'п2')!;
    expect(select).toBeTruthy();
    expect(laser).toBeTruthy();
    pickCombo(select, 'предатор');
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
    const select = screen.getAllByRole('combobox').find(one => comboOptions(one).some(o => o.label === 'та же'))!;
    pickCombo(select, other.tag);
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
    system.pages = [{ key: 'Шапка', top: true }, ...Object.keys(lists).map(name => ({ key: name }))];
    const listed = Object.entries(lists).flatMap(([page, on]) => on.map(list => ({ key: NAMES[list]!, page, list, parts: [] })));
    system.blocks = [...((system.blocks as unknown[]) ?? []), ...listed];
    if (hidden) {
      system.sheets = { враг: { label: 'Враг', blocks: listed.map(block => block.key).filter(name => !hidden.includes(name)) } };
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

describe('сумка: значения вещи', () => {
  const sets: unknown[][] = [];
  const original = tableSocket.setValue.bind(tableSocket);
  const withValues = (members: unknown[]): RoomState => ({
    id: 'к', title: 'Стол', members,
    system: {
      id: 'x', name: 'x', effects: {},
      tables: {
        вещь: {
          shape: 'book', use: 'item', label: 'Вещь',
          columns: [
            { key: 'провода', label: 'Беспроводной режим', kind: 'boolean', default: false },
            { key: 'заряды', label: 'Заряды', kind: 'number' },
          ],
        },
      },
    },
    compendium: { records: [{ id: 'фонарь', table: 'вещь', label: 'Фонарь', cells: { заряды: 3 } }] },
    sheets: [{ id: 'а', systemId: 'x', name: 'Арвен', values: {}, effects: [], has: [{ of: 'фонарь' }] }],
  } as unknown as RoomState);
  const as = (userId: string, members: unknown[]) => {
    useSession.setState(state => ({ ...state, userId }));
    useRoom.setState(state => ({ ...state, room: withValues(members), mySheetId: 'а', log: [], error: null }));
  };
  beforeEach(() => {
    sets.length = 0;
    tableSocket.setValue = (...args: unknown[]) => { sets.push(args); };
  });
  afterEach(() => { cleanup(); tableSocket.setValue = original; useSession.setState(state => ({ ...state, userId: '' })); });

  it('ведущий видит «Значения», правка уходит по адресу вещи', () => {
    as('g', [{ userId: 'g', name: 'Ведущий', role: 'gm' }]);
    renderOpen(<SheetScreen />);
    fireEvent.click(screen.getByText('Значения'));
    const box = screen.getByLabelText('Беспроводной режим');
    fireEvent.click(box);
    expect(sets.at(-1)).toEqual(['к', 'а', 'item:фонарь.провода', true]);
  });

  it('игрок без разрешения «Значений» не видит, с разрешением — видит', () => {
    as('p', [{ userId: 'g', name: 'Ведущий', role: 'gm' }, { userId: 'p', name: 'Аня', role: 'player' }]);
    renderOpen(<SheetScreen />);
    expect(screen.queryByText('Значения')).toBeNull();
    cleanup();
    as('p', [{ userId: 'g', name: 'Ведущий', role: 'gm' }, { userId: 'p', name: 'Аня', role: 'player', editsItems: true }]);
    renderOpen(<SheetScreen />);
    expect(screen.getByText('Значения')).toBeTruthy();
  });
});

describe('роли полей на листе за столом', () => {
  const sets: unknown[][] = [];
  const original = tableSocket.setValue.bind(tableSocket);
  const withRoles = (members: unknown[], values: Record<string, unknown>): RoomState => ({
    id: 'к', title: 'Стол', members,
    system: {
      id: 'x', name: 'x', effects: {},
      tables: {
        лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
          { key: 'хиты', label: 'Хиты', kind: 'number', default: 10 },
          { key: 'тайна', label: 'Тайна ведущего', kind: 'number', sees: 'gm', edits: 'gm' },
          { key: 'заметки', label: 'Заметки', kind: 'note', sees: 'owner' },
          { key: 'ранг', label: 'Ранг', kind: 'number', edits: 'gm' },
          { key: 'счётчик', label: 'Счётчик правил', kind: 'number', sees: 'none', edits: 'none' },
        ] },
        прочее: { shape: 'single', owner: 'sheet', label: 'Прочее', columns: [{ key: 'флаг', label: 'Служебный флаг', sees: 'none', expr: { expr: '1' } }] },
      },
      blocks: [
        { key: 'Основа', parts: [{ table: 'лист' }] },
        { key: 'Служебное', parts: [{ table: 'прочее' }] },
      ],
    },
    compendium: { records: [] },
    sheets: [{ id: 'а', systemId: 'x', name: 'Арвен', values, effects: [], has: [] }],
  } as unknown as RoomState);
  const GM = { userId: 'g', name: 'Ведущий', role: 'gm' };
  const as = (userId: string, members: unknown[], values: Record<string, unknown>) => {
    useSession.setState(state => ({ ...state, userId }));
    useRoom.setState(state => ({ ...state, room: withRoles(members, values), mySheetId: 'а', log: [], error: null }));
    renderOpen(<SheetScreen />);
  };
  const labels = () => [...document.querySelectorAll('.sheet .field__label')].map(node => node.textContent);
  beforeEach(() => {
    sets.length = 0;
    tableSocket.setValue = (...args: unknown[]) => { sets.push(args); };
  });
  afterEach(() => { cleanup(); tableSocket.setValue = original; useSession.setState(state => ({ ...state, userId: '' })); });

  it('ведущий видит всё, кроме служебного, и блок из одних служебных полей с листа пропал', () => {
    as('g', [GM], { тайна: 41, заметки: 'долг', счётчик: 3 });
    expect(labels()).toEqual(['Хиты', 'Тайна ведущего', 'Заметки', 'Ранг']);
    expect(screen.queryByText('Служебное')).toBeNull();
  });

  it('тот, кто играет листом, видит своё поле владельца, но не поле ведущего; «правит ведущий» показано без ввода', () => {
    as('p', [GM, { userId: 'p', name: 'Аня', role: 'player', sheetId: 'а' }], { заметки: 'долг', ранг: 2 });
    expect(labels()).toEqual(['Хиты', 'Заметки', 'Ранг']);
    expect((screen.getByLabelText('Заметки') as HTMLTextAreaElement).tagName).toBe('TEXTAREA');
    const rank = screen.getByText('Ранг').closest('.field')!;
    expect(rank.querySelector('input')).toBeNull();
    expect(rank.textContent).toContain('2');
    fireEvent.change(screen.getByText('Хиты').closest('.field')!.querySelector('input')!, { target: { value: '7' } });
    expect(sets.at(-1)).toEqual(['к', 'а', 'хиты', 7]);
  });

  it('сосед по столу, который листом не играет, поля владельца не видит', () => {
    as('q', [GM, { userId: 'q', name: 'Боря', role: 'player' }], {});
    expect(labels()).toEqual(['Хиты', 'Ранг']);
  });
});

