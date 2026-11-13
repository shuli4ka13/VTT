// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useWorld, emptySystem } from '../../../store/world.ts';
import { pickCombo } from '../../../testing/cards.ts';
import { CharacterSection } from './character-section.tsx';
import { SheetTab } from '../sheet-tab.tsx';
import type { System } from '@vtt/schema';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
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

  it('таблицу из блока убирает «×», сама таблица остаётся', () => {
    useWorld.setState(state => ({ ...state, system: { ...system(), blocks: [
      { name: 'Здоровье', parts: [{ table: 'лист', columns: ['hp'] }, { table: 'навыки' }] },
      { name: 'Богатство', parts: [{ table: 'лист', columns: ['gold'] }] },
    ] } }));
    render(<Sheets />);
    const drop = screen.getAllByTitle('убрать таблицу из блока — сама таблица останется в «Таблицах»');
    expect(drop).toHaveLength(1);
    fireEvent.click(drop[0]!);
    fireEvent.click(screen.getByText('точно убрать'));
    expect(blocksNow().find(b => b.name === 'Здоровье')!.parts).toEqual([{ table: 'лист', columns: ['hp'] }]);
    expect(useWorld.getState().system.tables?.навыки).toBeDefined();
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
    fireEvent.change(screen.getByLabelText('добавить поля из таблицы'), { target: { value: 'навыки' } });
    fireEvent.change(screen.getByLabelText('группировать по'), { target: { value: 'ability' } });
    const block = blocksNow().find(b => b.name === 'Новый блок')!;
    expect(block.parts[0]!.table).toBe('навыки');
    expect(block.parts[0]!.by).toBe('ability');
    const field = fieldsOf(useWorld.getState().system).find(f => f.cell?.column === 'bonus')!;
    expect(field.group).toBe('Новый блок');
    expect(field.section).toBe('мудрость');
  });

  it('справочник в блок — только после согласия: станет своим у каждого листа', () => {
    const id = 'классы';
    useWorld.getState().editSystem(draft => { (draft.tables ??= {})[id] = { label: 'Классы', key: 'word', rows: [{ value: 'воин' }, { value: 'маг' }] } as never; });
    render(<SheetTab />);
    fireEvent.click(screen.getByText('+ блок'));
    fireEvent.change(screen.getByLabelText('добавить поля из таблицы'), { target: { value: id } });
    expect(useWorld.getState().system.tables![id]!.owner).toBeUndefined();
    expect(blocksNow().find(b => b.name === 'Новый блок')!.parts).toEqual([]);
    fireEvent.click(screen.getByText('Нет'));
    expect(screen.queryByText('Да, своими у каждого листа')).toBeNull();
    fireEvent.change(screen.getByLabelText('добавить поля из таблицы'), { target: { value: id } });
    fireEvent.click(screen.getByText('Да, своими у каждого листа'));
    expect(useWorld.getState().system.tables![id]!.owner).toBe('sheet');
    expect(blocksNow().find(b => b.name === 'Новый блок')!.parts.map(p => p.table)).toEqual([id]);
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

describe('блоки листа перетаскиваются, как слои', () => {
  afterEach(() => { cleanup(); });

  it('схватил «Магию» и бросил над «Здоровьем» — на листе она выше', () => {
    useWorld.setState(state => ({ ...state, system: { ...emptySystem(), blocks: [
      { name: 'Здоровье', parts: [] }, { name: 'Навыки', parts: [] }, { name: 'Магия', parts: [] },
    ] } as unknown as System, activeBlock: null }));
    render(<CharacterSection system={useWorld.getState().system} editSystem={useWorld.getState().editSystem} />);
    const head = (name: string) => [...document.querySelectorAll('.block-fold__head')].find(el => el.textContent?.includes(name))! as HTMLElement;
    const dataTransfer = { setData: () => {}, effectAllowed: '' };
    fireEvent.dragStart(head('Магия'), { dataTransfer });
    fireEvent.dragOver(head('Здоровье'), { dataTransfer, clientY: -10 });
    fireEvent.drop(head('Здоровье'), { dataTransfer });
    expect(useWorld.getState().system.blocks!.map(b => b.name)).toEqual(['Магия', 'Здоровье', 'Навыки']);
  });
});

describe('раздел «Что даёт всем листам»', () => {
  afterEach(() => { cleanup(); });

  const give = () => {
    useWorld.setState(state => ({ ...state, system: { ...system(), effects: { удар: { label: 'Удар', activation: 'manual', params: [], steps: [] } } } as System, activeFieldTag: null, activeBlock: null, activeColumn: null, activeSheetKind: null }));
    render(<Sheets />);
  };

  it('пишет system.grants и снимает ключ, когда список пуст', () => {
    give();
    expect(screen.getByText('Что даёт всем листам')).toBeTruthy();
    expect(screen.getByText('Действует на любой лист, какого бы типа он ни был, и на лист без типа')).toBeTruthy();
    const box = document.querySelector<HTMLElement>('[data-field="Что даёт всем листам"]')!;
    pickCombo(box.querySelector<HTMLElement>('[role="combobox"]')!, 'удар');
    expect(useWorld.getState().system.grants).toEqual(['удар']);
    fireEvent.click(box.querySelector('.chip__x')!);
    expect('grants' in useWorld.getState().system).toBe(false);
  });

  it('«+ новое правило» заводит висящий эффект, выдаёт всем листам и открывает на вкладке «Эффекты»', () => {
    useWorld.setState(state => ({ ...state, system: { ...system(), effects: {} } as System, activeTab: 'sheet' as never, activeEffectId: null, activeSheetKind: null }));
    render(<Sheets />);
    const box = document.querySelector<HTMLElement>('[data-field="Что даёт всем листам"]')!;
    expect(within(box).getByText('Выдавать пока нечего.')).toBeTruthy();
    fireEvent.click(within(box).getByText('+ новое правило'));
    const now = useWorld.getState();
    const [key, effect] = Object.entries(now.system.effects)[0]!;
    expect(effect.activation).toBe('passive');
    expect(now.system.grants).toEqual([key]);
    expect(now.activeTab).toBe('effects');
    expect(now.activeEffectId).toBe(key);
  });

  it('внутри типа листа раздела нет, есть тихая строка с общими эффектами', () => {
    useWorld.setState(state => ({ ...state, system: { ...system(), grants: ['удар'], sheets: { враг: { label: 'Противник' } }, effects: { удар: { label: 'Удар', activation: 'manual', params: [], steps: [] } } } as System, activeFieldTag: null, activeBlock: null, activeColumn: null, activeSheetKind: 'враг' }));
    render(<Sheets />);
    expect(screen.queryByText('Что даёт всем листам')).toBeNull();
    expect(screen.getByText('Ещё действует общее для всех листов: «Удар».')).toBeTruthy();
    fireEvent.click(screen.getByText('все блоки'));
    expect(screen.getByText('Что даёт всем листам')).toBeTruthy();
  });

  it('видна в системе без типов листов: Киберпанк и Blades', () => {
    for (const name of ['Киберпанк RED', 'Blades in the Dark']) {
      const world = SAMPLE_WORLDS.find(one => one.system.name === name);
      expect(world, name).toBeTruthy();
      expect(Object.keys(world!.system.sheets ?? {})).toEqual([]);
      useWorld.setState(state => ({ ...state, system: world!.system, activeSheetKind: null }));
      const view = render(<Sheets />);
      expect(screen.getByText('Что даёт всем листам'), name).toBeTruthy();
      view.unmount();
    }
  });
});
