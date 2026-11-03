// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from './sheet-view.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 14 },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'броня', label: 'Броня', expr: { expr: '10' } },
  ] } },
  rolls: { проверка: { die: 'к20', fields: [{ table: 'лист', column: 'ловкость' }] } },
} as unknown as System;

const sheet = { id: 'а', name: 'Арвен', values: { ловкость: 14, хиты: 17 } } as unknown as Sheet;

const reader: Reader = {
  valueOf: () => ({ ok: true, value: 12 }),
  rollOf: () => null,
};


const underTitles = (): Record<string, string> => {
  const out: Record<string, string> = {};
  let title = '';
  for (const node of document.querySelectorAll('.sheet-table__section, .sheet-table__row')) {
    if (node.classList.contains('sheet-table__section')) title = node.textContent ?? '';
    else out[node.textContent ?? ''] = title;
  }
  return out;
};

describe('лист за столом', () => {
  afterEach(() => { cleanup(); });

  it('кнопка «бросить» есть только у поля с броском и зовёт его по тегу', () => {
    const rolled: string[] = [];
    render(<SheetView system={system} sheet={sheet} reader={reader} onChange={() => {}} onRoll={tag => rolled.push(tag)} />);

    const buttons = screen.getAllByText('бросить');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(rolled).toEqual(['ловкость']);
  });

  it('переключатель — только у «да/нет»: на числе он не рисуется, поле остаётся обычным', () => {
    const toggled = { tables: { лист: { shape: 'single', columns: [{ key: 'бой', label: 'Идёт бой', kind: 'number', control: { kind: 'toggle' } }] } } } as unknown as System;
    render(<SheetView system={toggled} sheet={{ ...sheet, values: { бой: 0 } } as Sheet} reader={reader} onChange={() => {}} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('вычисляемое поле не редактируется, а показывается', () => {
    render(<SheetView system={system} sheet={sheet} reader={reader} onChange={() => {}} />);
    const shown = [...document.querySelectorAll('.input--shown')].map(node => node.textContent);
    expect(shown).toEqual(['12']);
  });

  it('без onChange лист только читается', () => {
    render(<SheetView system={system} sheet={sheet} reader={reader} />);
    expect(document.querySelectorAll('input')).toHaveLength(0);
    expect(document.body.textContent).toContain('Арвен');
  });

  it('поля с одной подписью раздела выводятся подразделом с заголовком', () => {
    const grouped = {
      tables: {
        abilities: { shape: 'rows', columns: [{ key: 'name', label: 'Название', kind: 'text' }], rows: [
          { value: 'str', label: 'Сила' },
          { value: 'dex', label: 'Ловкость' },
        ] },
        навыки: { shape: 'rows', owner: 'sheet', columns: [
          { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
          { key: 'prof', label: 'Мастерство', kind: 'number' },
        ], rows: [
          { value: 'athletics', label: 'Атлетика', cells: { ability: 'str' } },
          { value: 'acrobatics', label: 'Акробатика', cells: { ability: 'dex' } },
          { value: 'stealth', label: 'Скрытность', cells: { ability: 'dex' } },
        ] },
      },
      blocks: [{ name: 'Навыки', parts: [{ table: 'навыки', by: 'ability' }] }],
    } as unknown as System;
    render(<SheetView system={grouped} sheet={{ id: 'б', name: 'Бор', values: {} } as unknown as Sheet} reader={reader} onChange={() => {}} />);
    const titles = [...document.querySelectorAll('.sheet-section__title')].map(node => node.textContent);
    expect(titles).toEqual(['Сила', 'Ловкость']);
    expect(underTitles()).toEqual({ Атлетика: 'Сила', Акробатика: 'Ловкость', Скрытность: 'Ловкость' });
  });

  it('группировка по колонке, которую вписывает игрок, — по значениям этого листа, в порядке вариантов', () => {
    const grouped = {
      tables: {
        ступени: { key: 'number', rows: [{ value: 0, label: 'нет' }, { value: 1, label: 'владение' }, { value: 2, label: 'мастерство' }] },
        навыки: { owner: 'sheet', key: 'word', columns: [
          { key: 'prof', label: 'Владение', kind: 'choice', from: 'ступени', default: 0 },
        ], rows: [
          { value: 'athletics', label: 'Атлетика' },
          { value: 'acrobatics', label: 'Акробатика' },
          { value: 'stealth', label: 'Скрытность' },
        ] },
      },
      blocks: [{ name: 'Навыки', parts: [{ table: 'навыки', by: 'prof' }] }],
    } as unknown as System;
    const values: Record<string, unknown> = { 'навыки.athletics.prof': 2, 'навыки.stealth.prof': 1 };
    const own: Reader = { valueOf: tag => ({ ok: true, value: values[tag] ?? 0 }), rollOf: () => null, storedOf: tag => values[tag] ?? 0 };
    render(<SheetView system={grouped} sheet={{ id: 'в', name: 'Вера', values } as unknown as Sheet} reader={own} onChange={() => {}} />);
    const titles = [...document.querySelectorAll('.sheet-section__title')].map(node => node.textContent);
    expect(titles).toEqual(['нет', 'владение', 'мастерство']);
    expect(underTitles()).toEqual({ Акробатика: 'нет', Скрытность: 'владение', Атлетика: 'мастерство' });
  });
});
