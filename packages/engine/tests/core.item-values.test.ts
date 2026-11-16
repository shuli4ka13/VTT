import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { itemCells, itemTag } from '../src/model/item-ref.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'вещи', name: 'Вещи', effects: {},
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
    вещь: {
      shape: 'book', use: 'item', label: 'Вещь',
      columns: [
        { key: 'провода', label: 'Беспроводной режим', kind: 'boolean', default: false },
        { key: 'заряды', label: 'Заряды', kind: 'number', min: 0, max: { expr: '@строка.ёмкость' } },
        { key: 'ёмкость', label: 'Ёмкость', kind: 'number' },
        { key: 'урон', label: 'Урон', kind: 'dice' },
        { key: 'вес', label: 'Вес', kind: 'number', expr: { expr: '@строка.ёмкость * 2' } },
        { key: 'цена', label: 'Цена', kind: 'number' },
        { key: 'тайна', label: 'Тайна', kind: 'text', onSheet: false },
        { key: 'рейтинг', label: 'Рейтинг', kind: 'number' },
        { key: 'тёмный', label: 'Тёмный', kind: 'boolean' },
      ],
    },
  },
} as unknown as System;

const compendium = {
  records: [{ id: 'фонарь', table: 'вещь', label: 'Фонарь', cells: { заряды: 3, ёмкость: 5, урон: '1к4', цена: { expr: '@строка.ёмкость * 10' } } }],
} as unknown as Compendium;

const hero: Sheet = { id: 'герой', systemId: 'вещи', name: 'Герой', values: {}, has: [{ of: 'фонарь' }], effects: [] };

const set = (sheet: Sheet, column: string, value: unknown) =>
  perform({ system, compendium, clock: null, sheets: [sheet], die: () => 1 }, { op: 'set', sheetId: sheet.id, tag: itemTag('фонарь', column), value } as never);

const after = (sheet: Sheet, column: string, value: unknown): Sheet => {
  const out = set(sheet, column, value);
  if (out.kind !== 'done') throw new Error('вписать не должно спрашивать');
  return out.sheets.find(one => one.id === sheet.id)!;
};

describe('вписать значение вещи за столом', () => {
  it('пишет в значения экземпляра; совпало с книгой — ключ уходит, лист прежний', () => {
    const on = after(hero, 'провода', true);
    expect(on.has[0]).toEqual({ of: 'фонарь', values: { провода: true } });
    expect(JSON.stringify(after(on, 'провода', false))).toBe(JSON.stringify(hero));
    const spent = after(hero, 'заряды', 1);
    expect(spent.has[0]!.values).toEqual({ заряды: 1 });
    expect(after(spent, 'заряды', 3).has[0]).toEqual({ of: 'фонарь' });
    expect(after(spent, 'заряды', null).has[0]).toEqual({ of: 'фонарь' });
  });

  it('без книжного значения и умолчания: вписал и вернул то, что экран показывал, — лист прежний', () => {
    expect(JSON.stringify(after(after(hero, 'рейтинг', 2), 'рейтинг', 0))).toBe(JSON.stringify(hero));
    expect(JSON.stringify(after(after(hero, 'тёмный', true), 'тёмный', false))).toBe(JSON.stringify(hero));
  });

  it('границы колонки — как у поля; верхняя видит строку записи и своё значение экземпляра', () => {
    expect(() => set(hero, 'заряды', -1)).toThrow('«Заряды» не меньше 0');
    expect(() => set(hero, 'заряды', 6)).toThrow('«Заряды» не больше 5');
    expect(() => set({ ...hero, has: [{ of: 'фонарь', values: { ёмкость: 2 } }] }, 'заряды', 3)).toThrow('«Заряды» не больше 2');
  });

  it('экземпляр — по своему ключу: второй фонарь, стоящий в первом, правится отдельно', () => {
    const two: Sheet = { ...hero, has: [{ of: 'фонарь', id: 'ф1' }, { of: 'фонарь', id: 'ф2', in: 'ф1' }] };
    const out = perform({ system, compendium, clock: null, sheets: [two], die: () => 1 }, { op: 'set', sheetId: two.id, tag: itemTag('ф2', 'провода'), value: true });
    if (out.kind !== 'done') throw new Error('вписать не должно спрашивать');
    expect(out.sheets[0]!.has).toEqual([{ of: 'фонарь', id: 'ф1' }, { of: 'фонарь', id: 'ф2', in: 'ф1', values: { провода: true } }]);
  });

  it('колонка типа-основы вписывается и у наследника', () => {
    const kin = {
      ...system,
      tables: { ...system.tables, лампа: { shape: 'book', use: 'item', label: 'Лампа', extends: 'вещь', columns: [{ key: 'яркость', label: 'Яркость', kind: 'number' }] } },
    } as unknown as System;
    const book = { records: [{ id: 'лампа', table: 'лампа', label: 'Лампа', cells: {} }] } as unknown as Compendium;
    const keeper: Sheet = { ...hero, has: [{ of: 'лампа' }] };
    expect(itemCells(kin, book, keeper, 'лампа').map(cell => cell.field.label)).toEqual(['Беспроводной режим', 'Заряды', 'Ёмкость', 'Цена', 'Рейтинг', 'Тёмный', 'Яркость']);
    const out = perform({ system: kin, compendium: book, clock: null, sheets: [keeper], die: () => 1 }, { op: 'set', sheetId: keeper.id, tag: itemTag('лампа', 'провода'), value: true });
    if (out.kind !== 'done') throw new Error('вписать не должно спрашивать');
    expect(out.sheets[0]!.has).toEqual([{ of: 'лампа', values: { провода: true } }]);
  });

  it('отказ словами: формула, кость, скрытая колонка, вид, нет колонки, нет вещи', () => {
    expect(() => set(hero, 'вес', 1)).toThrow('«Вес» у вещи «Фонарь» считается по правилу');
    expect(() => set(hero, 'цена', 1)).toThrow('«Цена» у вещи «Фонарь» считается по правилу');
    expect(() => set(hero, 'урон', '1к6')).toThrow('«Урон» у вещи «Фонарь» — кость: это правило записи');
    expect(() => set(hero, 'тайна', 'да')).toThrow('на листе не показывается');
    expect(() => set(hero, 'заряды', 'много')).toThrow('«Заряды» хранит число');
    expect(() => set(hero, 'свет', 1)).toThrow('нет колонки «свет»');
    expect(() => set({ ...hero, has: [] }, 'провода', true)).toThrow('нет вещи «фонарь»');
  });

  it('за столом вписываются только видные хранимые колонки, со значением экземпляра или книги', () => {
    const cells = itemCells(system, compendium, { ...hero, has: [{ of: 'фонарь', values: { заряды: 2 } }] }, 'фонарь');
    expect(cells.map(cell => [cell.field.label, cell.value])).toEqual([['Беспроводной режим', false], ['Заряды', 2], ['Ёмкость', 5], ['Рейтинг', 0], ['Тёмный', false]]);
    expect(cells[0]!.tag).toBe(itemTag('фонарь', 'провода'));
  });
});
