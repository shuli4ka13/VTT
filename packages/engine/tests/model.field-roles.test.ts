import { describe, it, expect } from 'vitest';
import { authorize, FIELD_BY_GM, FIELD_BY_RULES, FIELD_UNSEEN, GROUP_BY_GM } from '../src/core/authorize.ts';
import type { Room } from '../src/core/authorize.ts';
import { perform } from '../src/core/perform.ts';
import { sheetsFor, knows, shows } from '../src/model/roles.ts';
import { fieldOf } from '../src/model/sheet-columns.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'роли', name: 'Роли',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  rolls: { тайное: { label: 'Тайное', die: 'к20', bonus: { expr: '@число' }, fields: [{ table: 'лист', column: 'тайна' }, { table: 'лист', column: 'хиты' }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'хиты', label: 'Хиты', kind: 'number', default: 10 },
      { key: 'тайна', label: 'Тайна ведущего', kind: 'number', sees: 'gm', edits: 'gm' },
      { key: 'заметки', label: 'Заметки', kind: 'note', sees: 'owner' },
      { key: 'счётчик', label: 'Счётчик правил', kind: 'number', sees: 'none', edits: 'none' },
      { key: 'ранг', label: 'Ранг', kind: 'number', edits: 'gm' },
      { key: 'печать', label: 'Печать', kind: 'number', edits: 'none' },
    ] },
    отряд: { shape: 'single', owner: 'group', label: 'Отряд', columns: [{ key: 'казна', label: 'Казна', kind: 'number', sees: 'owner' }] },
    сцена: { shape: 'single', owner: 'desk', label: 'Сцена', columns: [{ key: 'засада', label: 'Засада', kind: 'number', sees: 'gm', edits: 'gm' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [
      { label: 'Шёпот', effect: 'шёпот', args: {} }, { label: 'Сверка', effect: 'сверка', args: {} }, { label: 'Жертва', effect: 'жертва', args: {} },
    ] },
  },
  effects: {
    шёпот: {
      label: 'Шёпот', activation: 'manual',
      params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
      steps: [
        { type: 'apply', target: { expr: '@кто.тайна' }, direction: 'set', value: { expr: '777' } },
        { type: 'apply', target: { expr: '@кто.хиты' }, direction: 'subtract', value: { expr: '2' } },
      ],
    },
    сверка: {
      label: 'Сверка', activation: 'manual',
      params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
      steps: [
        { type: 'check', value: { expr: '@кто.тайна' }, versus: { expr: '50' } },
        { type: 'check', value: { expr: '@кто.хиты' }, versus: { expr: '5' } },
      ],
    },
    жертва: {
      label: 'Жертва', activation: 'manual',
      params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
      cost: [
        { id: 'хватит', type: 'check', value: { expr: '@кто.тайна' }, versus: { expr: '1000' } },
        { type: 'branch', if: { expr: 'не @хватит.success' } }, { type: 'stop' }, { type: 'end' },
      ],
      steps: [],
    },
  },
} as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Шёпот', cells: {} }] } as unknown as Compendium;

const sheet = (id: string, values: Record<string, unknown> = {}, extra: Partial<Sheet> = {}): Sheet =>
  ({ id, systemId: 'роли', name: id, values, has: [{ of: 'приём' }], effects: [], ...extra } as Sheet);

const sheets = [
  sheet('арвен', { хиты: 7, тайна: 41, заметки: 'долг', счётчик: 3 }, { group: 'банда' }),
  sheet('мирра', { тайна: 42, заметки: 'клятва' }),
  sheet('гоблин', { тайна: 43, заметки: 'злоба' }),
  sheet('банда', { казна: 90, заметки: 'общак' }),
  sheet('стол', { засада: 5 }),
];

const room: Room = {
  system, sheets,
  members: [
    { userId: 'ведущий', role: 'gm', sheetId: null },
    { userId: 'игрок-а', role: 'player', sheetId: 'арвен' },
    { userId: 'игрок-м', role: 'player', sheetId: 'мирра' },
    { userId: 'зритель', role: 'player', sheetId: null },
  ],
};

const set = (sheetId: string, tag: string) => ({ kind: 'world' as const, op: { op: 'set' as const, sheetId, tag, value: 1 } });
const shift = (sheetId: string, tag: string) => ({ kind: 'world' as const, op: { op: 'shift' as const, sheetId, tag, by: 1 } });

describe('роли поля: кто правит', () => {
  it('обычное поле — как раньше: свой лист и свободный лист игрок правит, чужой — нет', () => {
    expect(authorize(room, 'игрок-а', set('арвен', 'хиты'))).toBeNull();
    expect(authorize(room, 'зритель', set('гоблин', 'хиты'))).toBeNull();
    expect(authorize(room, 'игрок-а', set('мирра', 'хиты'))).toMatch(/чужой лист/);
  });

  it('поле только ведущего игрок не правит ни вписыванием, ни сдвигом — он его не видит', () => {
    for (const want of [set('арвен', 'тайна'), shift('арвен', 'тайна')]) {
      expect(authorize(room, 'игрок-а', want)).toBe(FIELD_UNSEEN);
      expect(authorize(room, 'ведущий', want)).toBeNull();
    }
  });

  it('«правит ведущий» у видимого поля: игрок видит, но не правит', () => {
    expect(authorize(room, 'игрок-а', set('арвен', 'ранг'))).toBe(FIELD_BY_GM);
    expect(authorize(room, 'игрок-а', shift('арвен', 'ранг'))).toBe(FIELD_BY_GM);
    expect(authorize(room, 'ведущий', set('арвен', 'ранг'))).toBeNull();
  });

  it('служебное поле и «никто не правит» руками не правит никто, даже ведущий', () => {
    for (const tag of ['счётчик', 'печать']) {
      expect(authorize(room, 'ведущий', set('арвен', tag))).toBe(FIELD_BY_RULES);
      expect(authorize(room, 'игрок-а', shift('арвен', tag))).toBe(FIELD_BY_RULES);
    }
  });

  it('поле владельца правит тот, кто играет листом; взявший свободный лист «на минутку» его не видит', () => {
    expect(authorize(room, 'игрок-а', set('арвен', 'заметки'))).toBeNull();
    expect(authorize(room, 'зритель', set('гоблин', 'заметки'))).toBe(FIELD_UNSEEN);
    expect(authorize(room, 'ведущий', set('гоблин', 'заметки'))).toBeNull();
  });

  it('поле группы владельца правит участник группы; поле стола ведущего — только ведущий', () => {
    expect(authorize(room, 'игрок-а', set('арвен', 'казна'))).toBeNull();
    expect(authorize(room, 'игрок-м', set('мирра', 'казна'))).toBeNull();
    expect(authorize(room, 'игрок-а', set('стол', 'засада'))).toMatch(/стол правит ведущий|поле стола правит ведущий/);
    expect(authorize(room, 'ведущий', set('стол', 'засада'))).toBeNull();
  });

  it('бросок по полю, которого игрок не видит, — отказ: итог броска выдал бы значение', () => {
    const roll = (sheetId: string, tag: string) => ({ kind: 'world' as const, op: { op: 'roll' as const, sheetId, tag } });
    expect(authorize(room, 'игрок-а', roll('арвен', 'хиты'))).toBeNull();
    expect(authorize(room, 'игрок-а', roll('арвен', 'тайна'))).toBe(FIELD_UNSEEN);
    expect(authorize(room, 'игрок-а', roll('арвен', 'счётчик'))).toBe(FIELD_UNSEEN);
    expect(authorize(room, 'зритель', roll('гоблин', 'заметки'))).toBe(FIELD_UNSEEN);
    expect(authorize(room, 'ведущий', roll('арвен', 'тайна'))).toBeNull();
    expect(authorize(room, 'игрок-а', { kind: 'world', op: { op: 'roll', sheetId: 'арвен', tag: 'хиты', second: 'тайна' } })).toBe(FIELD_UNSEEN);
  });

  it('в группу лист ставит ведущий: иначе игрок «вступил бы» к чужому листу и читал поля его группы; выйти можно самому', () => {
    const group = (sheetId: string, to: string | null) => ({ kind: 'world' as const, op: { op: 'group' as const, sheetId, group: to } });
    expect(authorize(room, 'игрок-м', group('мирра', 'банда'))).toBe(GROUP_BY_GM);
    expect(authorize(room, 'игрок-м', group('мирра', 'арвен'))).toBe(GROUP_BY_GM);
    expect(authorize(room, 'игрок-а', group('арвен', null))).toBeNull();
    expect(authorize(room, 'игрок-а', group('мирра', null))).toMatch(/чужой лист/);
    expect(authorize(room, 'ведущий', group('мирра', 'банда'))).toBeNull();
  });

  it('правила ставят закрытое поле, как и раньше: шаг эффекта пишет в поле только ведущего', () => {
    const out = perform({ system, compendium: book, clock: null, sheets, die: () => 1 }, { op: 'act', intent: { actionId: 'приём:0', fromId: 'арвен', toIds: [] } });
    expect(out.sheets.find(one => one.id === 'арвен')!.values.тайна).toBe(777);
  });
});

describe('роли поля: кто знает значение', () => {
  const viewer = (userId: string) => {
    const me = room.members.find(member => member.userId === userId)!;
    return { gm: me.role === 'gm', sheetId: me.sheetId };
  };
  const seen = (userId: string, id: string) => sheetsFor(system, sheets, viewer(userId)).find(one => one.id === id)!.values;

  it('ведущий получает всё как есть', () => {
    expect(sheetsFor(system, sheets, viewer('ведущий'))).toEqual(sheets);
  });

  it('игроку не уходит поле ведущего ни у своего листа, ни у чужого, ни у стола', () => {
    for (const id of ['арвен', 'мирра', 'гоблин']) expect(Object.hasOwn(seen('игрок-а', id), 'тайна')).toBe(false);
    expect(seen('игрок-а', 'стол')).toEqual({});
  });

  it('поле владельца уходит тому, кто играет листом, и не уходит соседям', () => {
    expect(seen('игрок-а', 'арвен').заметки).toBe('долг');
    expect(Object.hasOwn(seen('игрок-а', 'мирра'), 'заметки')).toBe(false);
    expect(Object.hasOwn(seen('зритель', 'арвен'), 'заметки')).toBe(false);
  });

  it('поле группы владельца уходит участникам группы, а личное поле листа-группы — нет', () => {
    expect(seen('игрок-а', 'банда')).toEqual({ казна: 90 });
    expect(seen('игрок-м', 'банда')).toEqual({});
  });

  it('служебное поле — не секрет: значение уходит всем, но на листе его не показывают', () => {
    expect(seen('зритель', 'арвен').счётчик).toBe(3);
    const field = fieldOf(system, 'счётчик')!;
    expect(knows(sheets, viewer('зритель'), { id: 'арвен' }, field)).toBe(true);
    expect(shows(sheets, viewer('зритель'), { id: 'арвен' }, field)).toBe(false);
    expect(shows(sheets, viewer('ведущий'), { id: 'арвен' }, field)).toBe(false);
  });

  it('обычные значения и чужие листы не тронуты', () => {
    expect(seen('игрок-м', 'арвен')).toEqual({ хиты: 7, счётчик: 3 });
  });
});

describe('роли поля: журнал', () => {
  it('изменение закрытого поля в строку журнала не печатается, открытого — печатается', () => {
    const out = perform({ system, compendium: book, clock: null, sheets, die: () => 1 }, { op: 'act', intent: { actionId: 'приём:0', fromId: 'арвен', toIds: [] } });
    const text = out.log.join(' | ');
    expect(text).toContain('Хиты: 7 → 5');
    expect(text).not.toContain('777');
    expect(text).not.toContain('Тайна ведущего');
  });
});

describe('роли поля: числа закрытого поля в журнале и отказе', () => {
  const world = { system, compendium: book, clock: null, sheets, die: () => 12 };

  it('проверка без броска: значение закрытого поля слева не печатается, открытого — печатается', () => {
    const out = perform(world, { op: 'act', intent: { actionId: 'приём:1', fromId: 'арвен', toIds: [] } });
    const text = out.log.join(' | ');
    expect(text).not.toContain('41');
    expect(text).toContain('Тайна ведущего против');
    expect(text).toMatch(/Хиты: 7 против/);
  });

  it('отказ по цене называет закрытое поле без числа', () => {
    expect(() => perform(world, { op: 'act', intent: { actionId: 'приём:2', fromId: 'арвен', toIds: [] } })).toThrow(/не хватает «Тайна ведущего»$/);
  });

  it('бросок по закрытому полю печатает кости и исход, но не прибавку и не итог', () => {
    const secret = perform(world, { op: 'roll', sheetId: 'арвен', tag: 'тайна' }).log.join(' | ');
    expect(secret).toBe('арвен бросает «Тайное: Тайна ведущего»: [12]');
    expect(secret).not.toContain('41');
    expect(secret).not.toContain('53');
    const open = perform(world, { op: 'roll', sheetId: 'арвен', tag: 'хиты' }).log.join(' | ');
    expect(open).toContain('+ 7 = 19');
  });
});

describe('«Проблемы»: роли', () => {
  const base = (columns: unknown[], extra: Record<string, unknown> = {}): System => ({
    id: 'л', name: 'Л',
    tables: { лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns }, ...((extra.tables as object) ?? {}) },
    effects: (extra.effects as object) ?? {},
  }) as unknown as System;
  const found = (one: System, level: 'error' | 'warn') => lintSystem(one).filter(problem => problem.level === level).map(problem => problem.text);

  it('настройки без противоречий — без замечаний', () => {
    expect(lintSystem(system)).toEqual([]);
  });

  it('видимое считается из скрытого — ошибка: формула, значение «в новом листе», граница', () => {
    const one = base([
      { key: 'тайна', label: 'Тайна', kind: 'number', sees: 'gm', edits: 'gm' },
      { key: 'личное', label: 'Личное', kind: 'number', sees: 'owner' },
      { key: 'итог', label: 'Итог', expr: { expr: '@тайна + 1' } },
      { key: 'запас', label: 'Запас', kind: 'number', default: { expr: '@личное' } },
      { key: 'сила', label: 'Сила', kind: 'number', max: { expr: '@тайна' } },
      { key: 'свой_итог', label: 'Свой итог', sees: 'owner', expr: { expr: '@личное * 2' } },
      { key: 'узкий', label: 'Узкий', sees: 'gm', expr: { expr: '@личное + @тайна' } },
    ]);
    const errors = found(one, 'error');
    expect(errors.filter(text => text.includes('«Итог» считается из поля «Тайна»'))).toHaveLength(1);
    expect(errors.filter(text => text.includes('«Запас» считается из поля «Личное»'))).toHaveLength(1);
    expect(errors.filter(text => text.includes('«Сила» берёт границу из поля «Тайна»'))).toHaveLength(1);
    expect(errors.some(text => text.includes('«Свой итог»') || text.includes('«Узкий»'))).toBe(false);
  });

  it('правка «пока висит» видимого поля по скрытому — ошибка', () => {
    const one = base([
      { key: 'тайна', label: 'Тайна', kind: 'number', sees: 'gm', edits: 'gm' },
      { key: 'скорость', label: 'Скорость', kind: 'number', default: 30 },
    ], { effects: { страх: { label: 'Страх', activation: 'passive', modifiers: [{ kind: 'value', target: 'скорость', op: 'add', value: { expr: '@носитель.тайна' } }] } } });
    expect(found(one, 'error').some(text => text.includes('«Скорость» правится по полю «Тайна»'))).toBe(true);
  });

  it('противоречия — замечания: невидимое правят, поле ведущего правит игрок, «правит» у формулы, роли у справочника, владелец у стола', () => {
    const one = base([
      { key: 'а', label: 'Служебное', kind: 'number', sees: 'none' },
      { key: 'б', label: 'Скрытое', kind: 'number', sees: 'gm' },
      { key: 'в', label: 'Посчитанное', edits: 'gm', expr: { expr: '1' } },
    ], { tables: {
      ступени: { label: 'Ступени', key: 'word', columns: [{ key: 'цена', label: 'Цена', kind: 'number', sees: 'gm' }], rows: [{ value: 'первая' }] },
      сцена: { shape: 'single', owner: 'desk', label: 'Сцена', columns: [{ key: 'погода', label: 'Погода', kind: 'text', sees: 'owner' }] },
    } });
    const warns = found(one, 'warn');
    expect(warns.some(text => text.includes('«Служебное» не видит никто'))).toBe(true);
    expect(warns.some(text => text.includes('«Скрытое» видит только ведущий'))).toBe(true);
    expect(warns.some(text => text.includes('«Посчитанное» считается по формуле'))).toBe(true);
    expect(warns.some(text => text.includes('«Цена»') && text.includes('ни на что не влияют'))).toBe(true);
    expect(warns.some(text => text.includes('«Погода» — поле стола'))).toBe(true);
    expect(found(one, 'error')).toEqual([]);
  });
});
