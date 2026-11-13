// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { System, TableColumn } from '@vtt/schema';
import { TableColumnCard } from './tables-section.tsx';

describe('тип колонки с формулой', () => {
  it('«по формуле» снимает тип: значение даёт сама формула', () => {
    const column: TableColumn = { key: 'без_сил', label: 'Без сил', kind: 'number', expr: { expr: '@хиты <= 0' } } as TableColumn;
    const system = { tables: { лист: { shape: 'single', columns: [column] } }, constants: {}, effects: {} } as unknown as System;
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    const type = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.text === 'по формуле'))!;
    fireEvent.change(type, { target: { value: '' } });
    expect(column.kind).toBeUndefined();
    expect(screen.getAllByText('по формуле').length).toBeGreaterThan(0);
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
    const select = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.text === 'нет — просто число'))!;
    expect([...select.options].map(o => o.text)).toEqual(['нет — просто число', 'Уровень персонажа', 'Ярость']);
    fireEvent.change(select, { target: { value: 'уровни' } });
    expect(column.from).toBe('уровни');
  });

  it('«нет — просто число» снимает ссылку', () => {
    const column = { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни' } as TableColumn;
    const system = make(column);
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    const select = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.text === 'нет — просто число'))!;
    fireEvent.change(select, { target: { value: '' } });
    expect('from' in column).toBe(false);
  });

  it('смена типа снимает ссылку', () => {
    const column = { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни' } as TableColumn;
    const system = make(column);
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    expect(screen.getByText('Строка таблицы')).toBeTruthy();
    const type = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'text'))!;
    fireEvent.change(type, { target: { value: 'text' } });
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
