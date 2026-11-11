// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
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
      { id: 'стол', systemId: 'x', name: 'Стол', values: { страх: 3 }, has: [], effects: [] },
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
    fireEvent.change(screen.getByLabelText('единица времени'), { target: { value: 'days' } });
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
