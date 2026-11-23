// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { pickCombo } from '../../testing/cards.ts';
import { useRoom } from '../../store/room.ts';
import { useSession } from '../../store/session.ts';
import { tableSocket } from '../../api/socket.ts';
import { TableScreen, mayAnswer } from './table.tsx';
import type { RoomState } from '@vtt/schema';

const room = (clock: object | null): RoomState => ({
  id: 'к', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }],
  system: {
    id: 'x', name: 'x', tables: {}, effects: {},
  },
  compendium: { records: [] },
  sheets: [
    { id: 'а', systemId: 'x', name: 'Арвен', values: {}, has: [], effects: [] },
    { id: 'б', systemId: 'x', name: 'Мирра', values: {}, has: [], effects: [] },
  ],
  ...(clock ? { clock } : {}),
} as unknown as RoomState);

describe('стол: журнал и бой', () => {
  beforeEach(() => {
    useRoom.setState(state => ({
      ...state,
      room: room({ round: 2, order: ['а', 'б'], active: 'а' }),
      log: [
        { id: '1', at: '2026-09-20T07:05:00.000Z', text: 'Арвен бьёт Мирру' },
        { id: '2', at: 'не время', text: 'без отметки' },
      ],
      error: null,
    }));
  });
  afterEach(() => { cleanup(); });

  it('журнал подписан временем, битая отметка не ломает строку', () => {
    renderOpen(<TableScreen />);
    const lines = [...document.querySelectorAll('.log-line')].map(node => node.textContent ?? '');
    expect(lines[0]).toMatch(/^\d{2}:\d{2}Арвен бьёт Мирру$/);
    expect(lines[1]).toBe('без отметки');
  });

  it('вне боя стол так и говорит', () => {
    useRoom.setState(state => ({ ...state, room: room(null) }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('Бой не идёт')).toBeTruthy();
  });
});

describe('выбор целей на столе', () => {
  beforeEach(() => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
  });
  afterEach(() => { cleanup(); });

  it('первый клик назначает действующего, следующие набирают цели и снимают их', () => {
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

    fireEvent.click(token('Арвен'));
    expect(token('Арвен').className).toContain('token--from');
    expect(screen.getByText(/без целей — выберите цель/)).toBeTruthy();
    fireEvent.click(screen.getByText('на себя'));
    expect(screen.getByText('по Арвен')).toBeTruthy();

    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).toContain('token--to');
    expect(screen.getByText('по Мирра')).toBeTruthy();

    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).not.toContain('token--to');

    fireEvent.click(token('Арвен'));
    expect(token('Арвен').className).not.toContain('token--from');
  });

  it('«сбросить выбор» снимает и действующего, и цели разом', () => {
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));
    expect(token('Мирра').className).toContain('token--to');

    fireEvent.click(screen.getByText('сбросить выбор'));
    expect(token('Арвен').className).not.toContain('token--from');
    expect(token('Мирра').className).not.toContain('token--to');
    expect(screen.getByText('Кто действует?')).toBeTruthy();
  });

  it('за другим столом выбор начинается заново', () => {
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;
    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));

    act(() => { useRoom.setState(state => ({ ...state, room: { ...room(null), id: 'другой' } })); });
    expect(token('Арвен').className).not.toContain('token--from');
    expect(token('Мирра').className).not.toContain('token--to');
    expect(screen.getByText('Кто действует?')).toBeTruthy();
  });
});

describe('стороны фишек: взятые игроками листы — свои, остальные — чужие', () => {
  afterEach(() => { cleanup(); });
  const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;

  it('пока никто не взял лист, сторон нет', () => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(token('Арвен').className).not.toMatch(/token--(ally|foe)/);
  });

  it('лист игрока — свой, остальные — чужие', () => {
    const base = room(null);
    useRoom.setState(state => ({ ...state, room: { ...base, members: [...base.members, { userId: 'и', name: 'Игрок', role: 'player', sheetId: 'а' }] } as RoomState, log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(token('Арвен').className).toContain('token--ally');
    expect(token('Мирра').className).toContain('token--foe');
  });
});

describe('вопрос стола: отвечает владелец листа или ведущий', () => {
  const asked = (): RoomState => ({
    ...room(null),
    members: [
      { userId: 'gm', name: 'Ведущий', role: 'gm', sheetId: null },
      { userId: 'p1', name: 'Первый', role: 'player', sheetId: 'а' },
      { userId: 'p2', name: 'Второй', role: 'player', sheetId: null },
    ],
    pending: { id: 'q', sheetId: 'а', stage: 'target', question: 'Арвен: ответить?', options: [{ id: 'shield', label: 'Щит' }], preview: [] },
  }) as unknown as RoomState;
  afterEach(() => { cleanup(); });

  it('право отвечать: ведущий — всегда, владелец — за свой лист, чужой — нет, свободный лист — любой без своего', () => {
    const state = asked();
    expect(mayAnswer(state, 'gm', 'а')).toBe(true);
    expect(mayAnswer(state, 'p1', 'а')).toBe(true);
    expect(mayAnswer(state, 'p2', 'а')).toBe(false);
    expect(mayAnswer(state, 'p2', 'б')).toBe(true);
    expect(mayAnswer(state, 'нет', 'а')).toBe(false);
  });

  it('чужому кнопки выключены и объяснено, кто отвечает', () => {
    useSession.setState({ userId: 'p2' });
    useRoom.setState(state => ({ ...state, room: asked(), log: [], error: null }));
    renderOpen(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
    expect(screen.getByText('отвечает владелец листа или ведущий')).toBeTruthy();
  });

  it('владельцу кнопки доступны', () => {
    useSession.setState({ userId: 'p1' });
    useRoom.setState(state => ({ ...state, room: asked(), log: [], error: null }));
    renderOpen(<TableScreen />);
    const skip = screen.getByText('Пропустить').closest('button') as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
  });
});

describe('вопрос шага «Спросить»: один выбор кнопками', () => {
  const one = (): RoomState => ({
    ...room(null),
    members: [
      { userId: 'gm', name: 'Ведущий', role: 'gm', sheetId: null },
      { userId: 'p1', name: 'Первый', role: 'player', sheetId: 'а' },
    ],
    pending: {
      id: 'q', sheetId: 'desk', stage: 'step', one: true, question: 'Ведущий: Ничья. Кто победил?',
      options: [{ id: 'yes', label: 'Бьющий' }, { id: 'no', label: 'Защитник' }], preview: [],
    },
  }) as unknown as RoomState;
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('две кнопки с подписями, нажатие сразу шлёт один ответ, пропустить и применить нет', () => {
    const sent = vi.spyOn(tableSocket, 'answer').mockImplementation(() => undefined as never);
    useSession.setState({ userId: 'gm' });
    useRoom.setState(state => ({ ...state, room: one(), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('Ведущий: Ничья. Кто победил?')).toBeTruthy();
    expect(screen.queryByText('Пропустить')).toBeNull();
    expect(screen.queryByText('Применить')).toBeNull();
    fireEvent.click(screen.getByText('Защитник'));
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith({ roomId: 'к', pendingId: 'q', chosen: ['no'] });
  });

  it('игроку вопрос к ведущему недоступен', () => {
    useSession.setState({ userId: 'p1' });
    useRoom.setState(state => ({ ...state, room: one(), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect((screen.getByText('Бьющий').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('панель «Стол»', () => {
  const withDesk = (role: 'gm' | 'player'): RoomState => ({
    ...room(null),
    members: [{ userId: 'u', name: 'Я', role }],
    system: {
      id: 'x', name: 'x', effects: {},
      tables: { стол: { shape: 'single', owner: 'desk', columns: [
    { key: 'страх', label: 'Страх', kind: 'number' },
  ] } },
    },
    sheets: [
      { id: 'а', systemId: 'x', name: 'Арвен', values: {}, has: [], effects: [] },
      { id: 'desk', systemId: 'x', name: 'Стол', values: { страх: 3 }, has: [], effects: [] },
    ],
  } as unknown as RoomState);

  beforeEach(() => { useSession.setState(state => ({ ...state, userId: 'u' })); });
  afterEach(() => { cleanup(); });

  it('ведущий правит значение стола, стола нет среди фишек', () => {
    useRoom.setState(state => ({ ...state, room: withDesk('gm'), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('общий для всех — правите вы')).toBeTruthy();
    expect(screen.getByDisplayValue('3')).toBeTruthy();
    expect([...document.querySelectorAll('.token__name')].map(n => n.textContent)).toEqual(['Арвен']);
  });

  it('игрок видит значение, но не правит', () => {
    useRoom.setState(state => ({ ...state, room: withDesk('player'), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('общий для всех — правит ведущий')).toBeTruthy();
    expect(screen.queryByDisplayValue('3')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('полоса боя: начать, вступить, выйти', () => {
  const sent: unknown[] = [];
  const original = tableSocket.turn.bind(tableSocket);
  const withInitiative = (clock: object | null): RoomState => {
    const base = room(clock);
    return { ...base, system: { ...base.system, initiative: { die: 'к6', count: 1 } } } as unknown as RoomState;
  };
  beforeEach(() => {
    sent.length = 0;
    tableSocket.turn = intent => { sent.push(intent); };
    useSession.setState(state => ({ ...state, userId: 'u' }));
  });
  afterEach(() => { cleanup(); tableSocket.turn = original; });

  it('«Бросить инициативу» шлёт отмеченных, «Задать порядок» — порядок стрелками без броска', () => {
    useRoom.setState(state => ({ ...state, room: withInitiative(null), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(screen.getByText('Начать бой…'));
    fireEvent.click(screen.getByLabelText('Мирра'));
    fireEvent.click(screen.getAllByText('Бросить инициативу').at(-1)!.closest('button')!);
    expect(sent.at(-1)).toEqual({ roomId: 'к', op: 'start', who: ['а'] });

    fireEvent.click(screen.getByText('Начать бой…'));
    fireEvent.click(screen.getByText('Задать порядок'));
    fireEvent.click(screen.getByLabelText('Мирра выше'));
    fireEvent.click(screen.getByText('Начать по порядку'));
    expect(sent.at(-1)).toEqual({ roomId: 'к', op: 'start', order: ['б', 'а'] });
  });

  it('в бою — числа инициативы, кольцо у того, чей ход; «Вступить» шлёт join, крестик — leave', () => {
    useRoom.setState(state => ({ ...state, room: withInitiative({ round: 1, order: ['а'], active: 'а', scores: { а: 14 }, sec: 86400 + 3 }), log: [], error: null }));
    renderOpen(<TableScreen />);
    expect(screen.getByText('Раунд 1 · ходит Арвен')).toBeTruthy();
    expect(screen.getByText('День 2, 00:00:03')).toBeTruthy();
    expect(document.querySelector('.fight__score')?.textContent).toBe('14');
    expect(document.querySelector('.token--turn .token__name')?.textContent).toBe('Арвен');

    fireEvent.click(screen.getByText('Вступить…'));
    fireEvent.click(screen.getByLabelText('Мирра'));
    fireEvent.click(screen.getAllByText('Вступить').at(-1)!.closest('button')!);
    expect(sent.at(-1)).toEqual({ roomId: 'к', op: 'join', who: ['б'] });

    fireEvent.click(screen.getByLabelText('Арвен: выйти из боя'));
    expect(sent.at(-1)).toEqual({ roomId: 'к', op: 'leave', who: ['а'] });
  });

  it('«Прошло время» — число и единица', () => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.change(document.querySelector('.fight__span input')!, { target: { value: '2' } });
    pickCombo(screen.getByLabelText('единица времени'), 'days');
    fireEvent.click(screen.getByText('Прошло время'));
    expect(sent.at(-1)).toEqual({ roomId: 'к', op: 'time', seconds: 172800 });
  });
});

describe('журнал строками и фишки со сроками', () => {
  afterEach(() => { cleanup(); });

  it('запись действия: шапка, итог, подробности под «ещё»; без строк — текст целиком', () => {
    useRoom.setState(state => ({
      ...state, room: room(null), error: null,
      log: [
        { id: '1', at: 'не время', text: 'Арвен применяет «Удар» по Мирра · Бросок: [5] · хп: 10 → 7', lines: ['Арвен применяет «Удар» по Мирра', 'Бросок: [5]', 'хп: 10 → 7'] },
        { id: '2', at: 'не время', text: 'Мирра вступает в бой: инициатива 9' },
      ],
    }));
    renderOpen(<TableScreen />);
    const [act, plain] = [...document.querySelectorAll('.log-line')];
    expect(act!.querySelector('.log-line__head')?.textContent).toBe('Арвен применяет «Удар» по Мирра');
    expect(act!.querySelector('.log-line__outcome')?.textContent).toBe('хп: 10 → 7');
    expect(act!.querySelector('details .log-line__detail')?.textContent).toBe('Бросок: [5]');
    expect(plain!.textContent).toBe('Мирра вступает в бой: инициатива 9');
  });

  it('на фишке — значок висящего эффекта со сроком словами', () => {
    const base = room({ round: 2, order: ['а', 'б'], active: 'а' });
    base.system.effects = { яд: { label: 'Яд', activation: 'passive' } } as never;
    base.sheets[1]!.effects = [{ effectId: 'яд', turnsLeft: 2 }];
    useRoom.setState(state => ({ ...state, room: base, log: [], error: null }));
    renderOpen(<TableScreen />);
    const badge = document.querySelector('.token .hang__badge') as HTMLElement;
    expect(badge.textContent).toBe('Ядещё 2 хода');
    expect(badge.title).toBe('Яд — ещё 2 хода');
  });
});

describe('+ лист со стола', () => {
  const made: unknown[][] = [];
  const original = tableSocket.createSheet.bind(tableSocket);
  beforeEach(() => { made.length = 0; tableSocket.createSheet = (...args) => { made.push(args); }; });
  afterEach(() => { cleanup(); tableSocket.createSheet = original; });

  it('имя и тип одной формой', () => {
    const base = room(null);
    base.system.sheets = { npc: { label: 'Противник' }, pc: { label: 'Раннер' } } as never;
    useRoom.setState(state => ({ ...state, room: base, log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(screen.getByText('+ лист'));
    fireEvent.change(screen.getByPlaceholderText('имя'), { target: { value: 'Охранник' } });
    fireEvent.change(screen.getByLabelText('тип листа'), { target: { value: 'npc' } });
    fireEvent.click(screen.getByText('Завести'));
    expect(made.at(-1)).toEqual(['к', 'Охранник', 'npc']);
  });
});

describe('поле боя', () => {
  const placed: unknown[][] = [];
  const original = tableSocket.placePiece.bind(tableSocket);
  beforeEach(() => { placed.length = 0; tableSocket.placePiece = (...args) => { placed.push(args); }; });
  afterEach(() => { cleanup(); tableSocket.placePiece = original; });

  const withGrid = (): RoomState => {
    const base = room(null);
    base.system.grid = { step: 2, unit: 'м' } as never;
    return { ...base, places: { а: { x: 3, y: 1 } } } as RoomState;
  };

  it('без сетки поля нет; с сеткой фишка стоит в своей клетке, а лист без места — «не на поле»', () => {
    useRoom.setState(state => ({ ...state, room: room(null), log: [], error: null }));
    const first = renderOpen(<TableScreen />);
    expect(document.querySelector('.field-board')).toBeNull();
    first.unmount();

    useRoom.setState(state => ({ ...state, room: withGrid() }));
    renderOpen(<TableScreen />);
    const cell = document.querySelector('.field-cell[data-x="3"][data-y="1"]')!;
    expect(cell.querySelector('.token__face')?.textContent).toBe('А');
    expect(document.querySelectorAll('.field-board .token')).toHaveLength(1);
    expect(document.querySelector('.tokens')?.textContent).toContain('Мирра');
  });

  it('отпускание фишки на клетку шлёт одно сообщение, а в плитку — снятие с поля', () => {
    useRoom.setState(state => ({ ...state, room: withGrid(), log: [], error: null }));
    renderOpen(<TableScreen />);
    const cell = document.querySelector('.field-cell[data-x="5"][data-y="2"]')!;
    fireEvent.drop(cell, { dataTransfer: { getData: () => 'б' } });
    expect(placed).toEqual([['к', 'б', { x: 5, y: 2 }]]);

    fireEvent.drop(document.querySelector('.tokens')!, { dataTransfer: { getData: () => 'а' } });
    expect(placed.at(-1)).toEqual(['к', 'а', null]);
  });
});

describe('стол: кто меняет вещи', () => {
  const calls: unknown[][] = [];
  const original = tableSocket.allowItems.bind(tableSocket);
  const withPlayers = (): RoomState => ({
    ...room(null),
    members: [
      { userId: 'g', name: 'Ведущий', role: 'gm' },
      { userId: 'p', name: 'Аня', role: 'player', editsItems: true },
      { userId: 'q', name: 'Боря', role: 'player' },
    ],
  } as unknown as RoomState);
  beforeEach(() => {
    calls.length = 0;
    tableSocket.allowItems = (...args: unknown[]) => { calls.push(args); };
    useRoom.setState(state => ({ ...state, room: withPlayers(), log: [], error: null }));
  });
  afterEach(() => { cleanup(); tableSocket.allowItems = original; useSession.setState(state => ({ ...state, userId: '' })); });

  it('ведущий видит фишки игроков, щелчок разрешает', () => {
    useSession.setState(state => ({ ...state, userId: 'g' }));
    renderOpen(<TableScreen />);
    const line = screen.getByText('вещи меняют: ведущий').parentElement!;
    const chips = [...line.querySelectorAll('.chip')].map(node => node.textContent);
    expect(chips).toEqual(['Аня', 'Боря']);
    fireEvent.click([...line.querySelectorAll('.chip')].find(node => node.textContent === 'Боря')!);
    expect(calls.at(-1)).toEqual(['к', 'q', true]);
  });

  it('игрок видит только имена', () => {
    useSession.setState(state => ({ ...state, userId: 'q' }));
    renderOpen(<TableScreen />);
    const text = screen.getByText('вещи меняют: ведущий, Аня');
    expect(text.querySelector('.chip')).toBeNull();
  });
});

describe('стол: правки броска у действия', () => {
  const sent: unknown[] = [];
  const original = tableSocket.act.bind(tableSocket);
  const withAction = (): RoomState => ({
    ...room(null),
    system: {
      id: 'x', name: 'x',
      effects: { удар: { label: 'Удар', activation: 'manual', params: [], steps: [] } },
      roll_edits: { wild: { label: 'Дикий кубик', ops: [{ op: 'wild' }] } },
      tables: {
        меч: { shape: 'book', use: 'action', label: 'Меч', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
        броски: { label: 'Броски', key: 'word', columns: [{ key: 'claim', label: 'Заявляют за столом', kind: 'boolean' }], rows: [{ value: 'атака' }, { value: 'зрение', cells: { claim: true } }] },
      },
    },
    compendium: { records: [{ id: 'меч', table: 'меч', label: 'Меч', cells: {} }] },
    sheets: [
      { id: 'а', systemId: 'x', name: 'Арвен', values: {}, has: [{ of: 'меч' }], effects: [] },
      { id: 'б', systemId: 'x', name: 'Мирра', values: {}, has: [], effects: [] },
    ],
  } as unknown as RoomState);
  beforeEach(() => {
    sent.length = 0;
    tableSocket.act = (intent: unknown) => { sent.push(intent); };
    useRoom.setState(state => ({ ...state, room: withAction(), log: [], error: null }));
    useSession.setState(state => ({ ...state, userId: 'u' }));
  });
  afterEach(() => { cleanup(); tableSocket.act = original; useSession.setState(state => ({ ...state, userId: '' })); });

  it('те же отметки, что над листом, — и для действующего, и для целей; действие уходит с ними', () => {
    renderOpen(<TableScreen />);
    const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;
    fireEvent.click(token('Арвен'));
    fireEvent.click(token('Мирра'));
    fireEvent.click(screen.getByText('Правки броска'));
    const chipsOf = (label: string) => [...screen.getByText(`${label}:`).parentElement!.querySelectorAll('.chip')] as HTMLElement[];
    expect(chipsOf('броски Арвен').map(node => node.textContent)).toEqual(['Дикий кубик', 'зрение']);
    fireEvent.click(chipsOf('броски Арвен').find(node => node.textContent === 'зрение')!);
    fireEvent.click(chipsOf('броски целей').find(node => node.textContent === 'зрение')!);
    fireEvent.click(screen.getByRole('button', { name: 'Меч' }));
    expect(sent.at(-1)).toMatchObject({ actionId: 'меч:0', fromId: 'а', toIds: ['б'], claims: { а: ['зрение'], б: ['зрение'] } });
  });
});

describe('стол: отказ действия виден у действия', () => {
  const sent: unknown[] = [];
  const original = tableSocket.act.bind(tableSocket);
  const refusal = '«Меч» не состоялось: действие на этом ходу уже потрачено';
  const paid = (points: number): RoomState => ({
    ...room(null),
    system: {
      id: 'x', name: 'x',
      tables: {
        лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'очки', label: 'Очки действия', kind: 'number' }] },
        меч: { shape: 'book', use: 'action', label: 'Меч', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
      },
      effects: {
        удар: {
          label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }],
          cost: [
            { type: 'branch', if: { expr: '@действующий.очки < 1' } },
            { type: 'stop', note: { expr: '"действие на этом ходу уже потрачено"' } },
            { type: 'end' },
          ],
          steps: [],
        },
      },
    },
    compendium: { records: [{ id: 'меч', table: 'меч', label: 'Меч', cells: {} }] },
    sheets: [
      { id: 'а', systemId: 'x', name: 'Арвен', values: { очки: points }, has: [{ of: 'меч' }], effects: [] },
      { id: 'б', systemId: 'x', name: 'Мирра', values: {}, has: [], effects: [] },
    ],
  } as unknown as RoomState);
  const token = (name: string) => screen.getAllByText(name)[0]!.closest('button')!;
  const actionsCard = () => screen.getByText('Арвен действует').closest('.card') as HTMLElement;
  beforeEach(() => {
    sent.length = 0;
    tableSocket.act = (intent: unknown) => { sent.push(intent); };
    useSession.setState(state => ({ ...state, userId: 'u' }));
  });
  afterEach(() => { cleanup(); tableSocket.act = original; useSession.setState(state => ({ ...state, userId: '' })); });

  it('действие, которое нечем оплатить, неактивно, и рядом сказано почему', () => {
    useRoom.setState(state => ({ ...state, room: paid(0), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(token('Арвен'));
    const button = screen.getByRole('button', { name: 'Меч' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.closest('.actions-off')!.textContent).toContain('действие на этом ходу уже потрачено');
    expect(screen.getAllByText('действие на этом ходу уже потрачено')).toHaveLength(1);
    fireEvent.click(button);
    expect(sent).toEqual([]);
  });

  it('оплатить есть чем — действие активно и без пояснений', () => {
    useRoom.setState(state => ({ ...state, room: paid(1), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(token('Арвен'));
    const button = screen.getByRole('button', { name: 'Меч' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.closest('.actions-off')).toBeNull();
  });

  it('отказ сервера после нажатия показан у действий, один раз', () => {
    useRoom.setState(state => ({ ...state, room: paid(1), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(token('Арвен'));
    fireEvent.click(screen.getByRole('button', { name: 'Меч' }));
    expect(sent).toHaveLength(1);
    act(() => { useRoom.setState(state => ({ ...state, error: refusal })); });
    expect(screen.getAllByText(refusal)).toHaveLength(1);
    expect(actionsCard().textContent).toContain(refusal);
  });

  it('ошибка не от действия остаётся наверху, а не у действий', () => {
    useRoom.setState(state => ({ ...state, room: paid(1), log: [], error: null }));
    renderOpen(<TableScreen />);
    fireEvent.click(token('Арвен'));
    act(() => { useRoom.setState(state => ({ ...state, error: 'бой не идёт — вступать некуда' })); });
    expect(screen.getAllByText('бой не идёт — вступать некуда')).toHaveLength(1);
    expect(actionsCard().textContent).not.toContain('бой не идёт');
  });
});
