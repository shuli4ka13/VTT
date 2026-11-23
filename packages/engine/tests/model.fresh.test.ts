import { describe, it, expect } from 'vitest';
import { freshSheet, freshValues } from '../src/model/fresh.ts';
import { baseOf, calc, findField, newPass } from '../src/engine/calc.ts';
import { perform } from '../src/core/perform.ts';
import { blankDesk } from '../src/events/desk.ts';
import { mannequin } from '../src/events/trial.ts';
import { world as worldSchema } from '@vtt/schema';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'новый', name: 'Новый лист',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'уровень', label: 'Уровень', kind: 'number', default: 3 },
      { key: 'тел', label: 'Телосложение', kind: 'number', default: 14 },
      { key: 'хиты_макс', label: 'Максимум хитов', expr: { expr: '10 + @уровень * 2' } },
      { key: 'хиты', label: 'Хиты', kind: 'number', default: { expr: '@хиты_макс' }, min: 0, max: { expr: '@хиты_макс' } },
      { key: 'опыт', label: 'Опыт', kind: 'number' },
      { key: 'имя_рода', label: 'Род', kind: 'text', default: 'человек' },
      { key: 'в_строю', label: 'В строю', kind: 'boolean', default: true },
      { key: 'а', label: 'А', kind: 'number', default: { expr: '@б + 1' } },
      { key: 'б', label: 'Б', kind: 'number', default: { expr: '@в * 2' } },
      { key: 'в', label: 'В', kind: 'number', default: 5 },
      { key: 'не_число', label: 'Не число', kind: 'number', default: 'слово' },
    ] },
    навыки: { owner: 'sheet', key: 'word', columns: [
      { key: 'ранг', label: 'Ранг', kind: 'number', default: { expr: '@уровень + 1' } },
      { key: 'итог', label: 'Итог', expr: { expr: '@row.ранг * 2' } },
    ], rows: [
      { value: 'атлетика', label: 'Атлетика' },
      { value: 'обман', label: 'Обман', view: { ранг: { default: 7 } } },
    ] },
    отряд: { shape: 'single', owner: 'group', columns: [{ key: 'слава', label: 'Слава', kind: 'number', default: 2 }] },
    стол: { shape: 'single', owner: 'desk', columns: [
      { key: 'страх', label: 'Страх', kind: 'number', default: 1 },
      { key: 'запас', label: 'Запас', kind: 'number', default: { expr: '@страх + 4' } },
    ] },
  },
  sample: { уровень: 9, хиты: 1, опыт: 500 },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
      steps: [{ type: 'apply', target: { expr: '@кто.хиты' }, direction: 'subtract', value: { expr: '4' } }],
    },
  },
} as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as unknown as Compendium;

const played = { ...system, tables: { ...system.tables, приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } } } as unknown as System;

const read = (sheet: Sheet, tag: string): unknown => calc(system, sheet, tag, newPass(system, sheet));

describe('значения «в новом листе»', () => {
  const sheet = freshSheet(system, { id: 'л', name: 'Новый' });

  it('система с формулой и значениями образца проходит схему', () => {
    expect(worldSchema.system.safeParse(system).success).toBe(true);
  });

  it('число, слово и да/нет вписаны при заведении; не заданное, нулевое и не того вида — нет', () => {
    expect(sheet.values).toEqual({ уровень: 3, тел: 14, имя_рода: 'человек', в_строю: true, в: 5, 'навыки.обман.ранг': 7, слава: 2 });
  });

  it('формула при заведении не вписывается: поле равно ей, пока его не тронули', () => {
    expect(Object.hasOwn(sheet.values, 'хиты')).toBe(false);
    expect(read(sheet, 'хиты')).toBe(16);
    const grown = { ...sheet, values: { ...sheet.values, уровень: 10 } } as Sheet;
    expect(read(grown, 'хиты_макс')).toBe(30);
    expect(read(grown, 'хиты')).toBe(30);
  });

  it('вписанное значение за формулой больше не следует', () => {
    const hurt = { ...sheet, values: { ...sheet.values, хиты: 9 } } as Sheet;
    expect(read(hurt, 'хиты')).toBe(9);
    expect(read({ ...hurt, values: { ...hurt.values, уровень: 10 } } as Sheet, 'хиты')).toBe(9);
  });

  it('формулы видят друг друга в любом порядке, и клетки таблицы листа тоже', () => {
    expect(read(sheet, 'б')).toBe(10);
    expect(read(sheet, 'а')).toBe(11);
    expect(read(sheet, 'навыки.атлетика.ранг')).toBe(4);
    expect(read(sheet, 'навыки.атлетика.итог')).toBe(8);
    expect(read(sheet, 'навыки.обман.итог')).toBe(14);
  });

  it('основа поля — одна функция: своё значение, иначе формула, иначе число', () => {
    const pass = newPass(system, sheet);
    expect(baseOf(pass, findField(system, 'хиты')!)).toBe(16);
    expect(baseOf(pass, findField(system, 'уровень')!)).toBe(3);
    expect(baseOf(pass, findField(system, 'опыт')!)).toBe(0);
    const hurt = { ...sheet, values: { ...sheet.values, хиты: 9 } } as Sheet;
    expect(baseOf(newPass(system, hurt), findField(system, 'хиты')!)).toBe(9);
  });

  it('поле группы есть у каждого листа, поле стола — только у стола; формула стола читается у стола', () => {
    expect(sheet.values.слава).toBe(2);
    expect(Object.hasOwn(sheet.values, 'страх')).toBe(false);
    const desk = blankDesk(system);
    expect(desk.values).toEqual({ страх: 1 });
    expect(newPass(system, sheet, { shared: [desk] }).resolve('desk.запас')).toBe(5);
    expect(newPass(system, sheet, { shared: [{ ...desk, values: { страх: 6 } } as Sheet] }).resolve('desk.запас')).toBe(10);
  });

  it('значения образца в новый лист не попадают', () => {
    expect(sheet.values.уровень).toBe(3);
    expect(read(sheet, 'хиты')).toBe(16);
    expect(Object.hasOwn(sheet.values, 'опыт')).toBe(false);
  });

  it('уже вписанное при заведении не трогается', () => {
    const values = freshValues(system, { id: 'л', values: { уровень: 8 } });
    expect(Object.hasOwn(values, 'уровень')).toBe(false);
    expect(values.тел).toBe(14);
  });

  it('пустая клетка читается числом «в новом листе», как раньше', () => {
    const cleared = { ...sheet, values: {} } as Sheet;
    expect(read(cleared, 'уровень')).toBe(3);
    expect(read(cleared, 'хиты')).toBe(16);
  });

  it('«+ лист» за столом и манекен пробы заводятся так же', () => {
    const out = perform({ system, compendium: book, clock: null, sheets: [], die: () => 1, newId: () => 'новый-1' }, { op: 'sheet', name: 'Герой' });
    const made = out.sheets.find(one => one.name === 'Герой')!;
    expect(made.values).toMatchObject({ уровень: 3, слава: 2 });
    expect(Object.hasOwn(made.values, 'хиты')).toBe(false);
    expect(mannequin(system, 'м', 'Манекен').values).toMatchObject({ уровень: 3 });
  });
});

describe('поле, равное формуле, пока не тронуто: правки за столом', () => {
  const hero = (values: Record<string, unknown> = {}): Sheet =>
    ({ ...freshSheet(played, { id: 'г', name: 'Герой' }), has: [{ of: 'приём' }], values: { ...freshSheet(played, { id: 'г', name: 'Герой' }).values, ...values } } as Sheet);
  const world = (sheets: Sheet[]) => ({ system: played, compendium: book, clock: null, sheets, die: () => 1 });
  const hits = (out: { sheets: Sheet[] }) => out.sheets.find(one => one.id === 'г')!.values.хиты;

  it('сдвиг считается от формулы и вписывается', () => {
    expect(hits(perform(world([hero()]), { op: 'shift', sheetId: 'г', tag: 'хиты', by: -7 }))).toBe(9);
    expect(hits(perform(world([hero({ уровень: 10 })]), { op: 'shift', sheetId: 'г', tag: 'хиты', by: -7 }))).toBe(23);
  });

  it('сдвиг вверх от полного ничего не вписывает: поле по-прежнему следует за формулой', () => {
    const out = perform(world([hero()]), { op: 'shift', sheetId: 'г', tag: 'хиты', by: 5 });
    expect(Object.hasOwn(out.sheets.find(one => one.id === 'г')!.values, 'хиты')).toBe(false);
  });

  it('шаг «Изменение» отнимает от формулы и вписывает итог', () => {
    const out = perform(world([hero()]), { op: 'act', intent: { actionId: 'приём:0', fromId: 'г', toIds: [] } });
    expect(out.kind).toBe('done');
    expect(hits(out)).toBe(12);
  });

  it('после правки значение своё: рост уровня его не меняет', () => {
    const hurt = perform(world([hero()]), { op: 'shift', sheetId: 'г', tag: 'хиты', by: -7 });
    const grown = perform(world(hurt.sheets), { op: 'set', sheetId: 'г', tag: 'уровень', value: 10 });
    expect(hits(grown)).toBe(9);
  });
});
