// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { TableColumnCard } from './tables-section.tsx';

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
  const input = screen.getByPlaceholderText('как зовётся колонка');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

const columns = (table: string) => useWorld.getState().system.tables![table]!.columns!.map(c => c.key);

const base = (tables: Record<string, unknown>, blocks: unknown[] = []) => ({ tables, blocks, constants: {}, effects: {} } as unknown as System);

describe('ключ колонки идёт за названием, пока на неё никто не ссылается', () => {
  it('поле листа, уже стоящее в блоке, получает ключ по названию — и блок следует за ним', () => {
    open(base(
      { лист: { shape: 'single', columns: [{ key: 'field_4', label: 'Новое поле', kind: 'number' }] } },
      [{ name: 'Здоровье', parts: [{ table: 'лист', columns: ['field_4'], views: { field_4: { kind: 'bar' } } }] }],
    ), 'лист', 'field_4');
    rename('Здоровье');
    expect(columns('лист')).toEqual(['здоровье']);
    const part = useWorld.getState().system.blocks![0]!.parts[0]!;
    expect(part.columns ?? ['здоровье']).toEqual(['здоровье']);
    expect(part.views).toEqual({ здоровье: { kind: 'bar' } });
  });

  it('новая колонка таблицы со строками: «колонка» → по названию', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика' }], columns: [{ key: 'колонка', label: '', kind: 'number' }] } }), 'навыки', 'колонка');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['развитие']);
  });

  it('заполненная клетка держит ключ', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика', cells: { колонка: 2 } }], columns: [{ key: 'колонка', label: '', kind: 'number' }] } }), 'навыки', 'колонка');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['колонка']);
  });

  it('колонка, которую читает формула, держит ключ', () => {
    open(base({ навыки: { label: 'Навыки', key: 'word', rows: [{ value: 'атлетика' }], columns: [
      { key: 'колонка', label: '', kind: 'number' },
      { key: 'колонка_2', label: 'Значение', expr: { expr: '@строка.колонка * 5' } },
    ] } }), 'навыки', 'колонка');
    rename('Развитие');
    expect(columns('навыки')).toEqual(['колонка', 'колонка_2']);
  });

  it('свойство книги ключ не меняет: по нему вход эффекта получает значение сам', () => {
    open(base({ оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [{ key: 'урон_оружия', label: 'Урон оружия', kind: 'number' }] } }), 'оружие', 'урон_оружия');
    rename('Урон');
    expect(columns('оружие')).toEqual(['урон_оружия']);
  });
});
