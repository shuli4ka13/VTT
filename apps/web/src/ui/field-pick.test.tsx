// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldPick } from './field-pick.tsx';
import type { System } from '@vtt/schema';

afterEach(() => { cleanup(); });

const column = (key: string, label: string | undefined, group?: string) => ({
  key, ...(label ? { label } : {}), kind: 'number', default: 0, group,
});

const blocksOf = (table: string, cols: ReturnType<typeof column>[]) => {
  const names = [...new Set(cols.map(c => c.group).filter((g): g is string => Boolean(g)))];
  return names.map(name => ({ name, parts: [{ table, columns: cols.filter(c => c.group === name).map(c => c.key) }] }));
};

const strip = (cols: ReturnType<typeof column>[]) => cols.map(({ group: _g, ...rest }) => rest);

const build = (cols: ReturnType<typeof column>[]) => ({
  blocks: blocksOf('лист', cols),
  tables: { лист: { shape: 'single', label: 'Лист', columns: strip(cols) } },
  constants: {}, effects: {},
}) as unknown as System;

const options = () => [...document.querySelectorAll('option')].map(o => o.textContent);
const groups = () => [...document.querySelectorAll('optgroup')].map(g => g.getAttribute('label'));

describe('выбор поля листа', () => {
  const system = build([column('str', 'Сила', 'Атрибуты'), column('hp', 'Здоровье', 'Бой'), column('secret', 'Скрытое')]);

  it('поля сгруппированы по блокам, служебные спрятаны за пунктом', () => {
    render(<FieldPick system={system} value="" onChange={() => {}} />);
    expect(groups()).toEqual(['Атрибуты', 'Бой']);
    expect(options()).toContain('служебные поля (1)…');
    expect(options()).not.toContain('Скрытое');
  });

  it('пункт служебных полей раскрывает их и ничего не выбирает', () => {
    const onChange = vi.fn();
    render(<FieldPick system={system} value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '\u0000service' } });
    expect(options()).toContain('Скрытое');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('выбор отдаёт тег поля', () => {
    const onChange = vi.fn();
    render(<FieldPick system={system} value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hp' } });
    expect(onChange).toHaveBeenCalledWith('hp');
  });

  it('у поля без названия вместо ключа — «без названия»', () => {
    render(<FieldPick system={build([column('qq_key', undefined, 'Бой')])} value="qq_key" onChange={() => {}} />);
    expect(options()).toContain('без названия');
    expect(options().join('|')).not.toContain('qq_key');
  });

  it('выбранное служебное поле видно сразу', () => {
    render(<FieldPick system={system} value="secret" onChange={() => {}} />);
    expect(options()).toContain('Скрытое');
  });
});

describe('поиск по названию', () => {
  const many = build(Array.from({ length: 25 }, (_, at) => column(`f${at}`, at === 7 ? 'Ловкость' : `Поле ${at}`, 'Бой')));

  it('при числе пунктов больше двадцати над списком появляется строка поиска и фильтрует', () => {
    render(<FieldPick system={many} value="" onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('поиск по названию'), { target: { value: 'ловк' } });
    expect(options()).toEqual(['— какое поле —', 'Ловкость']);
  });

  it('при малом числе пунктов поиска нет', () => {
    render(<FieldPick system={build([column('a', 'А', 'Бой')])} value="" onChange={() => {}} />);
    expect(screen.queryByPlaceholderText('поиск по названию')).toBeNull();
  });

  it('выбранное поле остаётся в списке под фильтром', () => {
    render(<FieldPick system={many} value="f3" onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('поиск по названию'), { target: { value: 'ловк' } });
    expect(options()).toContain('Поле 3');
  });
});

describe('одинаковые названия', () => {
  it('в одном блоке различаются таблицей-домом', () => {
    const system = {
      blocks: [{ name: 'Бой', parts: [{ table: 'а', columns: ['x1'] }, { table: 'б', columns: ['x2'] }] }],
      tables: {
        а: { shape: 'single', label: 'Лист', columns: [{ key: 'x1', label: 'Сила', kind: 'number', default: 0 }] },
        б: { shape: 'single', label: 'Спутник', columns: [{ key: 'x2', label: 'Сила', kind: 'number', default: 0 }] },
      },
      constants: {}, effects: {},
    } as unknown as System;
    render(<FieldPick system={system} value="" onChange={() => {}} />);
    expect(options()).toEqual(expect.arrayContaining(['Сила · Лист', 'Сила · Спутник']));
  });
});
