import { describe, it, expect } from 'vitest';
import { freshSheet, freshValues } from '../src/model/fresh.ts';
import { calc, newPass } from '../src/engine/calc.ts';
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
      { key: 'хиты', label: 'Хиты', kind: 'number', default: { expr: '@хиты_макс' }, min: 0 },
      { key: 'опыт', label: 'Опыт', kind: 'number' },
      { key: 'имя_рода', label: 'Род', kind: 'text', default: 'человек' },
      { key: 'в_строю', label: 'В строю', kind: 'boolean', default: true },
      { key: 'а', label: 'А', kind: 'number', default: { expr: '@б + 1' } },
      { key: 'б', label: 'Б', kind: 'number', default: { expr: '@в * 2' } },
      { key: 'в', label: 'В', kind: 'number', default: 5 },
      { key: 'круг_1', label: 'Круг 1', kind: 'number', default: { expr: '@круг_2' } },
      { key: 'круг_2', label: 'Круг 2', kind: 'number', default: { expr: '@круг_1' } },
      { key: 'не_число', label: 'Не число', kind: 'number', default: { expr: '"слово"' } },
      { key: 'ноль', label: 'Ноль', kind: 'number', default: { expr: '@опыт * 0' } },
    ] },
    навыки: { owner: 'sheet', key: 'word', columns: [
      { key: 'ранг', label: 'Ранг', kind: 'number', default: { expr: '@уровень + 1' } },
      { key: 'итог', label: 'Итог', expr: { expr: '@строка.ранг * 2' } },
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
  effects: {},
} as unknown as System;

const book = { records: [] } as Compendium;

describe('значения при создании', () => {
  const sheet = freshSheet(system, { id: 'л', name: 'Новый' });

  it('система с формулой в значении при создании и значениями образца проходит схему', () => {
    expect(worldSchema.system.safeParse(system).success).toBe(true);
  });

  it('постоянные значения вписаны как введённые; не заданное и нулевое — нет', () => {
    expect(sheet.values).toMatchObject({ уровень: 3, тел: 14, имя_рода: 'человек', в_строю: true, в: 5 });
    expect(Object.hasOwn(sheet.values, 'опыт')).toBe(false);
  });

  it('формула считается один раз от посчитанного поля и вписывается числом', () => {
    expect(sheet.values.хиты).toBe(16);
    const grown = { ...sheet, values: { ...sheet.values, уровень: 10 } } as Sheet;
    expect(calc(system, grown, 'хиты_макс', newPass(system, grown))).toBe(30);
    expect(calc(system, grown, 'хиты', newPass(system, grown))).toBe(16);
  });

  it('формула видит другие формулы при создании в любом порядке', () => {
    expect(sheet.values.б).toBe(10);
    expect(sheet.values.а).toBe(11);
  });

  it('круг не роняет заведение листа: поля круга пусты, остальное на месте', () => {
    expect(Object.hasOwn(sheet.values, 'круг_1')).toBe(false);
    expect(Object.hasOwn(sheet.values, 'круг_2')).toBe(false);
    expect(sheet.values.уровень).toBe(3);
  });

  it('формула, давшая не тот тип, не вписывается; давшая ноль — вписывается нулём', () => {
    expect(Object.hasOwn(sheet.values, 'не_число')).toBe(false);
    expect(sheet.values.ноль).toBe(0);
  });

  it('клетки таблицы листа: формула колонки и своё значение строки', () => {
    expect(sheet.values['навыки.атлетика.ранг']).toBe(4);
    expect(sheet.values['навыки.обман.ранг']).toBe(7);
  });

  it('поле группы есть у каждого листа, поле стола — только у стола', () => {
    expect(sheet.values.слава).toBe(2);
    expect(Object.hasOwn(sheet.values, 'страх')).toBe(false);
    const desk = blankDesk(system);
    expect(desk.values).toEqual({ страх: 1, запас: 5 });
  });

  it('значения образца в новый лист не попадают', () => {
    expect(sheet.values.уровень).toBe(3);
    expect(sheet.values.хиты).toBe(16);
    expect(Object.hasOwn(sheet.values, 'опыт')).toBe(false);
  });

  it('уже вписанное не трогается', () => {
    const kept = { ...sheet, values: { уровень: 8 } } as Sheet;
    const values = freshValues(system, kept);
    expect(Object.hasOwn(values, 'уровень')).toBe(false);
    expect(values.хиты).toBe(26);
  });

  it('стёртая клетка: постоянное значение читается по-прежнему, формула при создании — нет', () => {
    const cleared = { ...sheet, values: {} } as Sheet;
    const pass = newPass(system, cleared);
    expect(calc(system, cleared, 'уровень', pass)).toBe(3);
    expect(calc(system, cleared, 'хиты', pass)).toBe(0);
  });

  it('«+ лист» за столом заводит лист со значениями при создании, манекен пробы — тоже', () => {
    const out = perform({ system, compendium: book, clock: null, sheets: [], die: () => 1, newId: () => 'новый-1' }, { op: 'sheet', name: 'Герой' });
    const made = out.sheets.find(one => one.name === 'Герой')!;
    expect(made.values).toMatchObject({ уровень: 3, хиты: 16, а: 11, слава: 2 });
    expect(mannequin(system, 'м', 'Манекен').values).toMatchObject({ уровень: 3, хиты: 16 });
  });

  it('у листа-ссылки на стол формула видит стол комнаты', () => {
    const wide = {
      ...system,
      tables: { ...system.tables, лист: { ...(system.tables as Record<string, { columns: unknown[] }>).лист, columns: [
        ...(system.tables as Record<string, { columns: unknown[] }>).лист!.columns,
        { key: 'доля', label: 'Доля', kind: 'number', default: { expr: '@стол.запас + 1' } },
      ] } },
    } as unknown as System;
    const desk = blankDesk(wide);
    expect(freshSheet(wide, { id: 'л', name: 'Новый' }, { shared: [desk] }).values.доля).toBe(6);
    expect(Object.hasOwn(freshSheet(wide, { id: 'л', name: 'Новый' }).values, 'доля')).toBe(false);
  });
});
