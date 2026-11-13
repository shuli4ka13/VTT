// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { pickCombo, comboOptions } from '../../../testing/cards.ts';
import type { System, TableColumn } from '@vtt/schema';
import { TableColumnCard } from './tables-section.tsx';

const comboWith = (test: (o: { value: string; label: string }) => boolean): HTMLInputElement =>
  [...document.querySelectorAll<HTMLInputElement>('[role="combobox"]')].find(el => comboOptions(el).some(test))!;

describe('тип колонки с формулой', () => {
  it('«по формуле» снимает тип: значение даёт сама формула', () => {
    const column: TableColumn = { key: 'без_сил', label: 'Без сил', kind: 'number', expr: { expr: '@хиты <= 0' } } as TableColumn;
    const system = { tables: { лист: { shape: 'single', columns: [column] } }, constants: {}, effects: {} } as unknown as System;
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    const type = comboWith(o => o.label === 'по формуле');
    pickCombo(type, '');
    expect(column.kind).toBeUndefined();
    expect(comboOptions(type).find(o => o.value === '')?.label).toBe('по формуле');
  });
});

describe('числовая колонка — строка таблицы', () => {
  const make = (column: TableColumn) => ({
    tables: {
      лист: { shape: 'single', columns: [column] },
      уровни: { label: 'Уровень персонажа', key: 'number', columns: [{ key: 'prof', label: 'Бонус мастерства', kind: 'number' }], rows: [{ value: 1 }] },
      ярость: { label: 'Ярость', key: 'range', columns: [], rows: [{ from: 1, to: 2 }] },
      классы: { label: 'Классы', key: 'word', columns: [], rows: [{ value: 'воин' }] },
    },
    constants: {}, effects: {},
  } as unknown as System);

  it('выбор «строка таблицы» — таблицы с ключом-числом и промежутком; выбрал — записалось from, «нет» — снялось', () => {
    const column = { key: 'уровень', label: 'Уровень', kind: 'number' } as TableColumn;
    const system = make(column);
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    const select = comboWith(o => o.label === 'нет — просто число');
    expect(comboOptions(select).map(o => o.label)).toEqual(['нет — просто число', 'Уровень персонажа', 'Ярость']);
    pickCombo(select, 'уровни');
    expect(column.from).toBe('уровни');
  });

  it('«нет — просто число» снимает ссылку', () => {
    const column = { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни' } as TableColumn;
    const system = make(column);
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    pickCombo(comboWith(o => o.label === 'нет — просто число'), '');
    expect('from' in column).toBe(false);
  });

  it('смена типа снимает ссылку', () => {
    const column = { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни' } as TableColumn;
    const system = make(column);
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    expect(screen.getByText('Строка таблицы')).toBeTruthy();
    pickCombo(comboWith(o => o.value === 'text'), 'text');
    expect(column.kind).toBe('text');
    expect('from' in column).toBe(false);
  });
});

describe('выбор без таблицы', () => {
  it('выбирать не из чего — колонка говорит, что сперва нужна таблица со строками', () => {
    const column = { key: 'характеристика', label: 'Характеристика', kind: 'choice' } as TableColumn;
    const system = { tables: { навыки: { label: 'Навыки', key: 'word', owner: 'sheet', columns: [column], rows: [{ value: 'атлетика' }] } }, constants: {}, effects: {} } as unknown as System;
    render(<TableColumnCard id="навыки" table={system.tables!.навыки!} column={column} system={system}
      edit={change => change(system.tables!.навыки!)} onClose={() => {}} />);
    expect(screen.getByText(/выбирать не из чего: сперва заведите таблицу со строками/)).toBeTruthy();
  });
});

describe('подсказка колонки', () => {
  it('пишется в колонку и снимается пустым значением', () => {
    const column = { key: 'сила', label: 'Сила', kind: 'number' } as TableColumn;
    const system = { tables: { лист: { shape: 'single', columns: [column] } }, constants: {}, effects: {} } as unknown as System;
    const view = render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} more />);
    const area = () => document.querySelector<HTMLTextAreaElement>('[data-field="Подсказка"] textarea')!;
    fireEvent.change(area(), { target: { value: 'мощь тела' } });
    expect(column.hint).toBe('мощь тела');
    view.rerender(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} more />);
    fireEvent.change(area(), { target: { value: '' } });
    expect('hint' in column).toBe(false);
  });
});
