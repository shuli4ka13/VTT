// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { CharacterSection } from './character-section.tsx';
import { SheetTab } from '../sheet-tab.tsx';
import type { System } from '@vtt/schema';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

function Sheets() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  return <CharacterSection system={system} editSystem={editSystem} />;
}

const system = (): System => ({
  ...emptySystem(),
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'hp', label: 'Хиты', kind: 'number' },
      { key: 'gold', label: 'Золото', kind: 'number' },
      { key: 'loose', label: 'Ничьё', kind: 'number' },
    ] },
    навыки: {
      label: 'Навыки', owner: 'sheet',
      columns: [{ key: 'ability', label: 'Характеристика', kind: 'number' }, { key: 'bonus', label: 'Бонус', kind: 'number' }],
      rows: [{ value: 'воля', label: 'Воля', cells: { ability: 'мудрость' } }],
    },
  },
  blocks: [
    { name: 'Здоровье', parts: [{ table: 'лист', columns: ['hp'] }] },
    { name: 'Богатство', parts: [{ table: 'лист', columns: ['gold'] }] },
  ],
} as System);

const blocksNow = () => useWorld.getState().system.blocks!;

describe('листы: блоки и типы', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: system(), activeFieldTag: null, activeBlock: null, activeColumn: null })); });
  afterEach(() => { cleanup(); });

  it('«+ тип листа» заводит тип, снятая отметка убирает блок с этого типа', () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText('+ тип листа'));
    const [key, kind] = Object.entries(useWorld.getState().system.sheets ?? {})[0]!;
    expect(kind.label).toBe('Новый тип листа');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.sheets?.[key]?.blocks).toEqual(['Здоровье']);
    fireEvent.click(boxes[1]!);
    expect(useWorld.getState().system.sheets?.[key]?.blocks).toBeUndefined();
  });

  it('«+ блок» заводит пустой блок и выбирает его', () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText('+ блок'));
    expect(blocksNow().map(b => b.name)).toContain('Новый блок');
    expect(blocksNow().find(b => b.name === 'Новый блок')!.parts).toEqual([]);
    expect(useWorld.getState().activeBlock).toBe('Новый блок');
  });

  it('часть «таблица навыки, группировать по характеристике»', () => {
    render(<SheetTab />);
    fireEvent.click(screen.getByText('+ блок'));
    fireEvent.click(screen.getByText('+ часть'));
    fireEvent.change(screen.getByLabelText('таблица части'), { target: { value: 'навыки' } });
    fireEvent.change(screen.getByLabelText('группировать по'), { target: { value: 'ability' } });
    const block = blocksNow().find(b => b.name === 'Новый блок')!;
    expect(block.parts).toEqual([{ table: 'навыки', by: 'ability' }]);
    const field = fieldsOf(useWorld.getState().system).find(f => f.cell?.column === 'bonus')!;
    expect(field.group).toBe('Новый блок');
    expect(field.section).toBe('мудрость');
  });

  it('переименование блока обновляет типы листов и вложенные блоки', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        blocks: [...state.system.blocks!, { name: 'Запас', parent: 'Богатство', parts: [] }],
        sheets: { hero: { label: 'Герой', blocks: ['Богатство', 'Запас'] } },
      },
      activeBlock: 'Богатство',
    }));
    render(<SheetTab />);
    const name = screen.getByPlaceholderText('как зовётся блок');
    fireEvent.change(name, { target: { value: 'Казна' } });
    fireEvent.blur(name);
    const system = useWorld.getState().system;
    expect(system.blocks!.map(b => b.name)).toEqual(['Здоровье', 'Казна', 'Запас']);
    expect(system.blocks![2]!.parent).toBe('Казна');
    expect(system.sheets!.hero!.blocks).toEqual(['Казна', 'Запас']);
  });

  it('поле без блока показано внизу, «в блок…» дописывает колонку в часть', () => {
    render(<Sheets />);
    expect(screen.getByText('Без блока')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('«Ничьё»: в блок'), { target: { value: 'Здоровье' } });
    expect(blocksNow()[0]!.parts).toEqual([{ table: 'лист', columns: ['hp', 'loose'] }]);
    expect(screen.queryByLabelText('«Ничьё»: в блок')).toBeNull();
  });
});
