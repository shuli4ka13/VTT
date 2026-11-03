// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SheetView } from './sheet-view.tsx';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 14, roll: { label: 'Проверка Ловкости' } },
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'броня', label: 'Броня', expr: { expr: '10' } },
  ] } },
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

const single = (key: string, label: string) => ({ shape: 'single', columns: [{ key, label, kind: 'number', default: 1 }] });

const pagedSystem = (extra: Record<string, unknown> = {}) => ({
  tables: { а: single('а1', 'Сила'), б: single('б1', 'Хиты'), в: single('в1', 'Монеты'), г: single('г1', 'Заметка') },
  pages: [{ name: 'Шапка', top: true }, { name: 'Бой' }, { name: 'Вещи' }, { name: 'Пустая' }],
  blocks: [
    { name: 'Главное', page: 'Шапка', parts: [{ table: 'а' }] },
    { name: 'Здоровье', page: 'Бой', parts: [{ table: 'б' }] },
    { name: 'Деньги', page: 'Вещи', parts: [{ table: 'в' }] },
    { name: 'Скрытое', page: 'Пустая', parts: [{ table: 'г' }] },
  ],
  ...extra,
}) as unknown as System;

describe('страницы листа', () => {
  afterEach(cleanup);
  const base = { sheet, reader, onChange: () => {} };

  it('без pages закладок нет и все блоки подряд', () => {
    render(<SheetView system={pagedSystem()} {...base} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(document.body.textContent).toContain('Здоровье');
    expect(document.body.textContent).toContain('Деньги');
  });

  it('шапка видна всегда, закладки по страницам, переключение меняет блоки', () => {
    const chosen: string[] = [];
    const view = (at: string | null) => (
      <SheetView system={pagedSystem()} {...base} only={['а1', 'б1', 'в1']} pages={{ at, onAt: name => chosen.push(name) }} />
    );
    const { rerender } = render(view(null));
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Бой', 'Вещи']);
    expect(document.body.textContent).toContain('Главное');
    expect(document.body.textContent).toContain('Здоровье');
    expect(document.body.textContent).not.toContain('Деньги');
    fireEvent.click(screen.getByText('Вещи'));
    expect(chosen).toEqual(['Вещи']);
    rerender(view('Вещи'));
    expect(document.body.textContent).toContain('Главное');
    expect(document.body.textContent).toContain('Деньги');
    expect(document.body.textContent).not.toContain('Здоровье');
  });

  it('страница без видимых блоков получает закладку, только если есть переданный список', () => {
    const system = pagedSystem({ pages: [{ name: 'Шапка', top: true }, { name: 'Бой' }, { name: 'Сумка', lists: ['things'] }] });
    const { rerender } = render(<SheetView system={system} {...base} pages={{ at: 'Сумка', onAt: () => {} }} />);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Бой']);
    rerender(<SheetView system={system} {...base} pages={{ at: 'Сумка', onAt: () => {}, lists: { things: <p>Снаряжение тут</p> } }} />);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Бой', 'Сумка']);
    expect(screen.getByText('Снаряжение тут')).toBeTruthy();
  });

  it('столбцы: блок с stack 2 — в правой стопке, wide — отдельная полоса', () => {
    const system = pagedSystem({
      pages: [{ name: 'Главная', stacks: 2 }],
      blocks: [
        { name: 'Один', parts: [{ table: 'а' }] },
        { name: 'Два', stack: 2, parts: [{ table: 'б' }] },
        { name: 'Широкий', wide: true, parts: [{ table: 'в' }] },
        { name: 'Три', parts: [{ table: 'г' }] },
      ],
    });
    render(<SheetView system={system} {...base} pages={{ at: null, onAt: () => {} }} />);
    const bands = [...document.querySelectorAll('.sheet-page > *')];
    expect(bands).toHaveLength(3);
    const cols = bands[0]!.querySelectorAll('.sheet-stacks__col');
    expect(cols).toHaveLength(2);
    expect(cols[0]!.textContent).toContain('Один');
    expect(cols[1]!.textContent).toContain('Два');
    expect(bands[1]!.className).toBe('sheet-band');
    expect(bands[1]!.textContent).toContain('Широкий');
    expect(bands[2]!.querySelectorAll('.sheet-stacks__col')[0]!.textContent).toContain('Три');
    expect(bands[2]!.querySelectorAll('.sheet-stacks__col')[1]!.textContent).toBe('');
  });

  it('столбец, в котором у этого листа нет ни одного блока, не оставляет пустого места', () => {
    const system = pagedSystem({
      pages: [{ name: 'Главная', stacks: 3 }],
      blocks: [
        { name: 'Один', parts: [{ table: 'а' }] },
        { name: 'Два', stack: 2, parts: [{ table: 'б' }] },
        { name: 'Три', stack: 3, parts: [{ table: 'в' }] },
      ],
    });
    render(<SheetView system={system} {...base} only={['б1', 'в1']} pages={{ at: null, onAt: () => {} }} />);
    const cols = [...document.querySelectorAll('.sheet-stacks__col')].map(col => col.textContent);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain('Два');
    expect(cols[1]).toContain('Три');
  });

  it('«по два в строку» ставит полям блока два столбца', () => {
    const system = pagedSystem({ blocks: [{ name: 'Главное', per: 2, parts: [{ table: 'а' }] }] });
    render(<SheetView system={system} {...base} />);
    expect((document.querySelector('.row--per') as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('с all закладка есть и у пустой страницы, на ней — подсказка', () => {
    render(<SheetView system={pagedSystem()} {...base} only={['а1', 'б1']} pages={{ at: 'Вещи', onAt: () => {}, all: true }} />);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Бой', 'Вещи', 'Пустая']);
    expect(document.body.textContent).toContain('На этой странице пока пусто');
  });
});

describe('таблица блока в несколько столбцов', () => {
  afterEach(cleanup);
  const table = {
    abilities: { shape: 'rows', columns: [{ key: 'name', label: 'Название', kind: 'text' }], rows: [
      { value: 'str', label: 'Сила' }, { value: 'dex', label: 'Ловкость' },
    ] },
    навыки: { shape: 'rows', owner: 'sheet', columns: [
      { key: 'ability', label: 'Характеристика', kind: 'choice', from: 'abilities' },
      { key: 'prof', label: 'Мастерство', kind: 'number' },
    ], rows: [
      { value: 'a1', label: 'Атлетика', cells: { ability: 'str' } },
      { value: 'a2', label: 'Борьба', cells: { ability: 'str' } },
      { value: 'b1', label: 'Акробатика', cells: { ability: 'dex' } },
      { value: 'b2', label: 'Скрытность', cells: { ability: 'dex' } },
    ] },
  };
  const make = (part: Record<string, unknown>, split?: number) => ({
    tables: table,
    blocks: [{ name: 'Навыки', ...(split ? { split } : {}), parts: [{ table: 'навыки', ...part }] }],
  }) as unknown as System;

  it('split 2: две сетки, у каждой свои шапки колонок', () => {
    render(<SheetView system={make({}, 2)} sheet={sheet} reader={reader} onChange={() => {}} />);
    const grids = document.querySelectorAll('.sheet-table');
    expect(grids).toHaveLength(2);
    for (const grid of grids) expect(grid.querySelector('.field__label')?.textContent).toBeTruthy();
    expect([...grids[0]!.querySelectorAll('.sheet-table__row')].map(n => n.textContent)).toEqual(['Атлетика', 'Борьба']);
    expect([...grids[1]!.querySelectorAll('.sheet-table__row')].map(n => n.textContent)).toEqual(['Акробатика', 'Скрытность']);
  });

  it('подзаголовок не остаётся последним в столбце: уходит вместе со строками', () => {
    render(<SheetView system={make({ by: 'ability' }, 2)} sheet={sheet} reader={reader} onChange={() => {}} />);
    const grids = document.querySelectorAll('.sheet-table');
    expect(grids).toHaveLength(2);
    expect([...grids[0]!.querySelectorAll('.sheet-table__section')].map(n => n.textContent)).toEqual(['Сила']);
    expect([...grids[1]!.querySelectorAll('.sheet-table__section')].map(n => n.textContent)).toEqual(['Ловкость']);
    expect(grids[0]!.lastElementChild!.classList.contains('sheet-table__section')).toBe(false);
  });

  it('без split — одна сетка', () => {
    render(<SheetView system={make({})} sheet={sheet} reader={reader} onChange={() => {}} />);
    expect(document.querySelectorAll('.sheet-table')).toHaveLength(1);
  });
});

