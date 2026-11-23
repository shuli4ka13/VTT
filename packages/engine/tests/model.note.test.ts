import { describe, it, expect } from 'vitest';
import { lintSystem } from '../src/model/lint.ts';
import { fieldOf, misfit, NOTE_LIMIT } from '../src/model/sheet-columns.ts';
import { freshSheet } from '../src/model/fresh.ts';
import { perform } from '../src/core/perform.ts';
import { kindsFor } from '../src/words/kinds.ts';
import { columnFamily, viewsFor } from '../src/model/views.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const NOTES = { key: 'заметки', label: 'Заметки', kind: 'note' };

const base = (columns: unknown[], extra: Record<string, unknown> = {}): System => ({
  id: 'текст', name: 'Текст',
  tables: { лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns }, ...((extra.tables as object) ?? {}) },
  effects: (extra.effects as object) ?? {},
  ...(extra.blocks ? { blocks: extra.blocks } : {}),
}) as unknown as System;

const errors = (system: System): string[] => lintSystem(system).filter(problem => problem.level === 'error').map(problem => problem.text);

const book: Compendium = { records: [] };

const blank = (id: string): Sheet => ({ id, systemId: 'текст', name: id, values: {}, has: [], effects: [] } as Sheet);

describe('поле «текст»: значение', () => {
  const system = base([NOTES, { key: 'имя', label: 'Имя', kind: 'text' }]);
  const field = fieldOf(system, 'заметки')!;

  it('хранится строкой в несколько строк, число и список не принимает', () => {
    expect(field.value).toMatchObject({ kind: 'stored', type: 'note', default: '' });
    expect(misfit(field, 'первая строка\nвторая строка')).toBeNull();
    expect(misfit(field, 5)).toMatch(/хранит текст/);
    expect(misfit(field, ['а'])).toMatch(/одно значение/);
  });

  it('длиннее предела — отказ словами', () => {
    expect(misfit(field, 'я'.repeat(NOTE_LIMIT))).toBeNull();
    expect(misfit(field, 'я'.repeat(NOTE_LIMIT + 1))).toMatch(/не длиннее/);
  });

  it('вписывается операцией «вписать» вместе с переносами строк', () => {
    const out = perform({ system, compendium: book, clock: null, sheets: [blank('а')], die: () => 1 }, { op: 'set', sheetId: 'а', tag: 'заметки', value: 'долг трактирщику\n3 золотых' });
    expect(out.sheets.find(sheet => sheet.id === 'а')?.values.заметки).toBe('долг трактирщику\n3 золотых');
  });

  it('текст «в новом листе» получает каждый новый лист', () => {
    const started = base([{ ...NOTES, default: 'Цели:\nУзы:' }]);
    expect(freshSheet(started, { id: 'новый', name: 'Новый' }).values).toEqual({ заметки: 'Цели:\nУзы:' });
  });
});

describe('поле «текст»: где оно бывает', () => {
  it('в списке видов значения — только у поля листа', () => {
    expect(kindsFor('field').map(([kind]) => kind)).toContain('note');
    for (const place of ['table', 'prop', 'param'] as const) expect(kindsFor(place).map(([kind]) => kind)).not.toContain('note');
  });

  it('видов у текста нет', () => {
    expect(viewsFor(columnFamily(NOTES as never), false)).toEqual([]);
  });

  it('у поля листа, группы и стола — без замечаний', () => {
    const system = base([NOTES], {
      tables: {
        отряд: { shape: 'single', owner: 'group', label: 'Отряд', columns: [{ key: 'планы', label: 'Планы', kind: 'note' }] },
        сцена: { shape: 'single', owner: 'desk', label: 'Сцена', columns: [{ key: 'обстановка', label: 'Обстановка', kind: 'note' }] },
      },
    });
    expect(lintSystem(system)).toEqual([]);
  });

  it('у колонки таблицы строк, справочника, свойства записи и входа эффекта — ошибка', () => {
    const system = base([{ key: 'уровень', label: 'Уровень', kind: 'number' }], {
      tables: {
        навыки: { owner: 'sheet', label: 'Навыки', key: 'word', columns: [{ key: 'память', label: 'Память', kind: 'note' }], rows: [{ value: 'атлетика' }] },
        ступени: { label: 'Ступени', key: 'word', columns: [{ key: 'описание', label: 'Описание', kind: 'note' }], rows: [{ value: 'первая' }] },
        оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'легенда', label: 'Легенда', kind: 'note' }] },
      },
      effects: {
        удар: { label: 'Удар', activation: 'manual', params: [{ key: 'клич', label: 'Клич', kind: 'note' }], steps: [] },
      },
    });
    const found = errors(system);
    for (const name of ['«Память»', '«Описание»', '«Легенда»', '«Клич»']) {
      expect(found.some(text => text.includes(name) && text.includes('только у поля листа'))).toBe(true);
    }
  });

  it('формула «в новом листе» и расчёт по формуле — ошибка', () => {
    const system = base([
      { key: 'уровень', label: 'Уровень', kind: 'number' },
      { ...NOTES, default: { expr: '@уровень' } },
      { key: 'сводка', label: 'Сводка', kind: 'note', expr: { expr: '@уровень' } },
    ]);
    const found = errors(system);
    expect(found.some(text => text.includes('«Заметки»') && text.includes('без формулы'))).toBe(true);
    expect(found.some(text => text.includes('«Сводка»') && text.includes('по формуле он не считается'))).toBe(true);
  });

  it('вид у текста — замечание: на листе будет обычное поле', () => {
    const system = base([NOTES], { blocks: [{ key: 'Заметки', parts: [{ table: 'лист', columns: ['заметки'], views: { заметки: { kind: 'big' } } }] }] });
    expect(lintSystem(system).some(problem => problem.level === 'warn' && problem.text.includes('не подходит к типу значения'))).toBe(true);
  });
});

describe('поле «текст»: формулы и шаги его не читают', () => {
  it('формула поля, которая читает текст, — ошибка', () => {
    const system = base([NOTES, { key: 'длина', label: 'Длина', expr: { expr: '@заметки' } }]);
    expect(errors(system).some(text => text.includes('«Заметки»') && text.includes('не читают'))).toBe(true);
  });

  it('шаг эффекта, который читает или меняет текст, — ошибка', () => {
    const system = base([NOTES, { key: 'хиты', label: 'Хиты', kind: 'number' }], {
      effects: {
        запись: {
          label: 'Запись', activation: 'manual',
          params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
          steps: [{ type: 'apply', target: { expr: '@кто.заметки' }, direction: 'set', value: { expr: '1' } }],
        },
        чтение: {
          label: 'Чтение', activation: 'manual',
          params: [{ key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' }],
          steps: [{ type: 'apply', target: { expr: '@кто.хиты' }, direction: 'set', value: { expr: '@кто.заметки' } }],
        },
      },
    });
    const found = lintSystem(system).filter(problem => problem.level === 'error' && problem.text.includes('не читают'));
    expect(found.map(problem => problem.where.effect).sort()).toEqual(['запись', 'чтение']);
  });
});
