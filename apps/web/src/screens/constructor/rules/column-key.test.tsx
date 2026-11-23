// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { TableColumnCard, renameTable, moveTable } from './tables-section.tsx';

afterEach(() => { cleanup(); });

const open = (system: System, table: string, key: string) => {
  act(() => { useWorld.getState().replaceWorld({ system, compendium: { records: [] }, sheets: [] }); });
  const Card = () => {
    const now = useWorld(s => s.system);
    const column = now.tables![table]!.columns!.find(c => c.key === key) ?? now.tables![table]!.columns![0]!;
    return <TableColumnCard id={table} table={now.tables![table]!} column={column} system={now}
      edit={change => useWorld.getState().editSystem(draft => change(draft.tables![table]!))} onClose={() => {}} />;
  };
  render(<Card />);
};

const rename = (text: string) => {
  const input = screen.getByPlaceholderText(/^как зовётся (поле|колонка|свойство)$/);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

const columns = (table: string) => useWorld.getState().system.tables![table]!.columns!.map(c => c.key);

const base = (tables: Record<string, unknown>, blocks: unknown[] = []) => ({ tables, blocks, constants: {}, effects: {} } as unknown as System);

describe('ключ колонки идёт за названием, пока на неё никто не ссылается', () => {
  it('переименование колонки не теряет переводы — ни свой, ни соседней колонки', () => {
    open(base({ лист: { shape: 'single', columns: [
      { key: 'field_4', label: 'Новое поле', kind: 'number', i18n: { en: { label: 'New field' } } },
      { key: 'ac', label: 'Класс брони', kind: 'number', i18n: { en: { label: 'Armor class' } } },
    ] } }), 'лист', 'field_4');
    rename('Здоровье');
    const got = useWorld.getState().system.tables!['лист']!.columns! as { key: string; label?: string; i18n?: unknown }[];
    expect(got.map(column => [column.key, column.label, column.i18n])).toEqual([
      ['zdorove', 'Здоровье', { en: { label: 'New field' } }],
      ['ac', 'Класс брони', { en: { label: 'Armor class' } }],
    ]);
  });

  it('поле листа, уже стоящее в блоке, получает ключ по названию — и блок следует за ним', () => {
    open(base(
      { лист: { shape: 'single', columns: [{ key: 'field_4', label: 'Новое поле', kind: 'number' }] } },
      [{ key: 'Здоровье', parts: [{ table: 'лист', columns: ['field_4'], views: { field_4: { kind: 'bar' } } }] }],
    ), 'лист', 'field_4');
    rename('Здоровье');
    expect(columns('лист')).toEqual(['zdorove']);
    const part = useWorld.getState().system.blocks![0]!.parts[0]!;
    expect(part.columns ?? ['zdorove']).toEqual(['zdorove']);
    expect(part.views).toEqual({ zdorove: { kind: 'bar' } });
  });

  it('новая колонка таблицы со строками: «колонка» → по названию', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика' }], columns: [{ key: 'kolonka', label: '', kind: 'number' }] } }), 'навыки', 'kolonka');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['razvitie']);
  });

  it('заполненная клетка держит ключ', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика', cells: { kolonka: 2 } }], columns: [{ key: 'kolonka', label: '', kind: 'number' }] } }), 'навыки', 'kolonka');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['kolonka']);
  });

  it('колонка, которую читает формула, держит ключ', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика' }], columns: [
      { key: 'kolonka', label: '', kind: 'number' },
      { key: 'kolonka_2', label: 'Значение', expr: { expr: '@row.kolonka * 5' } },
    ] } }), 'навыки', 'kolonka');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['kolonka', 'kolonka_2']);
  });

  it('свойство книги ключ не меняет: по нему вход эффекта получает значение сам', () => {
    open(base({ оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [{ key: 'урон_оружия', label: 'Урон оружия', kind: 'number' }] } }), 'оружие', 'урон_оружия');
    rename('Урон');
    expect(columns('оружие')).toEqual(['урон_оружия']);
  });
});

describe('ключ таблицы идёт за названием, пока на неё никто не ссылается', () => {
  const skills = { label: '', key: 'word', owner: 'sheet', rows: [{ value: 'атлетика' }], columns: [{ key: 'razvitie', label: 'Развитие', kind: 'number' }] };

  it('новая таблица на листе: «таблица» → по названию, и блок следует за ней', () => {
    const system = base({ harakteristiki: { label: 'Характеристики', key: 'word', rows: [] }, tablica: skills },
      [{ key: 'Навыки', parts: [{ table: 'tablica' }] }]);
    const fresh = renameTable(system, 'tablica', 'Навыки Warhammer', {});
    expect(fresh).toBe('navyki_warhammer');
    moveTable(system, 'tablica', fresh);
    expect(Object.keys(system.tables!)).toEqual(['harakteristiki', 'navyki_warhammer']);
    expect(system.blocks![0]!.parts[0]!.table).toBe('navyki_warhammer');
  });

  it('таблицу читает формула или ссылается колонка — ключ держится', () => {
    const read = base({ tablica: skills, лист: { shape: 'single', columns: [{ key: 'x', label: 'X', expr: { expr: '@tablica.атлетика.развитие' } }] } });
    expect(renameTable(read, 'tablica', 'Навыки', {})).toBe('tablica');
    const linked = base({ tablica: skills, другая: { label: 'Другая', key: 'word', columns: [{ key: 'навык', label: 'Навык', kind: 'choice', from: 'tablica' }] } });
    expect(renameTable(linked, 'tablica', 'Навыки', {})).toBe('tablica');
  });

  it('значения листов по этой таблице держат ключ', () => {
    const system = base({ tablica: skills });
    expect(renameTable(system, 'tablica', 'Навыки', { sheets: [{ values: { 'tablica.атлетика.развитие': 2 } }] })).toBe('tablica');
  });
});
