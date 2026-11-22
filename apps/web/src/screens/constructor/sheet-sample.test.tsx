// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { pickCombo } from '../../testing/cards.ts';
import { SheetSample, sampleValues } from './sheet-sample.tsx';
import { ThingPanel } from './thing-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', effects: {},
  tables: {
    лист: { shape: 'single', columns: [{ key: 'монеты', label: 'Монеты', kind: 'number' }] },
    оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [{ key: 'урон', label: 'Урон', kind: 'number' }] },
  },
  pages: [{ name: 'Сумка' }],
  blocks: [{ name: 'Деньги', page: 'Сумка', parts: [{ table: 'лист' }] }, { name: 'Вещи', page: 'Сумка', list: 'things', parts: [] }],
} as unknown as System;

describe('образец листа: сумка из типов вещей и умений', () => {
  afterEach(cleanup);

  it('добавляет образец типа, со случайными свойствами только для показа, убирает, книга мира не нужна', () => {
    useWorld.setState(state => ({ ...state, system, compendium: { records: [] }, activePage: null, activeBlock: null }));
    render(<SheetSample system={system} />);
    expect(screen.getByText('У образца пока ничего нет — добавьте образец вещи или умения.')).toBeTruthy();
    pickCombo(screen.getByLabelText('добавить образец'), 'оружие');
    expect(screen.getByText('Оружие 1')).toBeTruthy();
    expect(useWorld.getState().system).toBe(system);
    expect(document.body.textContent).toMatch(/Урон: \d+/);
    expect(screen.getByText('Оружие 1').closest('.inline')!.parentElement!.querySelector('input')).toBeNull();
    fireEvent.click(screen.getByText('убрать'));
    expect(screen.queryByText('Оружие 1')).toBeNull();
  });

  it('снаряжение делится по типам; щелчок по типу открывает слева «что видно в строке», галочка пишет признак в тип', () => {
    useWorld.setState(state => ({ ...state, system, compendium: { records: [] }, activePage: null, activeBlock: null, activeThing: null }));
    function Live() {
      const current = useWorld(state => state.system);
      const thing = useWorld(state => state.activeThing);
      return <>{thing ? <ThingPanel table={thing} system={current} /> : null}<SheetSample system={current} /></>;
    }
    render(<Live />);
    pickCombo(screen.getByLabelText('добавить образец'), 'оружие');
    fireEvent.click(screen.getByRole('button', { name: 'Оружие' }));
    expect(useWorld.getState().activeThing).toBe('оружие');
    expect(document.body.textContent).toMatch(/Урон: \d+/);
    fireEvent.click(screen.getByLabelText('Урон'));
    expect(useWorld.getState().system.tables!['оружие']!.columns![0]!.onSheet).toBe(false);
    expect(document.body.textContent).not.toMatch(/Урон: \d+/);
    fireEvent.click(screen.getByLabelText('Урон'));
    expect(useWorld.getState().system.tables!['оружие']!.columns![0]).not.toHaveProperty('onSheet');
  });
});

describe('образец листа: служебные поля и выбор по умолчанию', () => {
  afterEach(cleanup);

  const world = {
    id: 'x', name: 'x', effects: {},
    tables: {
      классы: { label: 'Классы', shape: 'rows', key: 'word', columns: [], rows: [{ value: 'воин', label: 'Воин' }, { value: 'маг', label: 'Маг' }] },
      лист: { shape: 'single', columns: [
        { key: 'класс', label: 'Класс', kind: 'choice', from: 'классы' },
        { key: 'запас', label: 'Запас', kind: 'number' },
      ] },
      кошель: { shape: 'single', columns: [{ key: 'монеты', label: 'Монеты', kind: 'number' }] },
    },
    pages: [{ name: 'Сумка' }],
    blocks: [{ name: 'Деньги', page: 'Сумка', parts: [{ table: 'кошель' }] }],
  } as unknown as System;

  it('выбор без умолчания получает первый вариант', () => {
    expect(sampleValues(world)).toEqual({ класс: 'воин' });
  });

  it('показывает только поля из блоков, остальные — свёрнутой строкой', () => {
    useWorld.setState(state => ({ ...state, system: world, compendium: { records: [] }, activePage: null, activeBlock: null }));
    render(<SheetSample system={world} />);
    expect(screen.getByText('образец: значения подставлены для примера')).toBeTruthy();
    expect(screen.queryByLabelText('Запас')).toBeNull();
    expect(document.body.textContent).toContain('служебные поля');
  });
});

describe('образец листа: свои значения, в настоящие листы не попадают', () => {
  afterEach(cleanup);
  const start = {
    id: 'x', name: 'x', effects: {},
    tables: {
      лист: { shape: 'single', columns: [
        { key: 'сила', label: 'Сила', kind: 'number', default: 10 },
        { key: 'запас_макс', label: 'Предел', expr: { expr: '@сила * 2' } },
        { key: 'запас', label: 'Запас', kind: 'number', default: { expr: '@запас_макс' } },
      ] },
    },
    blocks: [{ name: 'Основа', parts: [{ table: 'лист' }] }],
  } as unknown as System;
  const fieldOf = (label: string) => screen.getByText(label).closest('.field')!.querySelector('input') as HTMLInputElement;
  function Live() {
    const current = useWorld(state => state.system);
    return <SheetSample system={current} />;
  }
  const open = () => {
    useWorld.setState(state => ({ ...state, system: start, compendium: { records: [] }, activePage: null, activeBlock: null }));
    render(<Live />);
  };

  it('образец показывает то, с чем заводится новый лист: число и формулу при создании', () => {
    open();
    expect(fieldOf('Сила').value).toBe('10');
    expect(fieldOf('Запас').value).toBe('20');
  });

  it('ввод в образец пишет значения образца и не трогает «в новом листе» колонки', () => {
    open();
    fireEvent.change(fieldOf('Сила'), { target: { value: '15' } });
    const system = useWorld.getState().system;
    expect(system.sample).toEqual({ сила: 15 });
    expect(system.tables!['лист']!.columns![0]!.default).toBe(10);
    expect(fieldOf('Сила').value).toBe('15');
  });

  it('значение, равное тому, с чем лист и так заводится, своё снимает', () => {
    open();
    fireEvent.change(fieldOf('Сила'), { target: { value: '15' } });
    fireEvent.change(fieldOf('Сила'), { target: { value: '10' } });
    expect(useWorld.getState().system).not.toHaveProperty('sample');
  });
});

describe('значения образца идут за полем', () => {
  it('переименованное поле и таблица уносят значение образца с собой, удалённое поле — снимает', async () => {
    const { renameColumn, moveTable } = await import('./rules/tables-section.tsx');
    const world = {
      id: 'x', name: 'x', effects: {},
      tables: {
        лист: { shape: 'single', columns: [{ key: 'field', label: 'Новое поле', kind: 'number' }, { key: 'запас', label: 'Запас', kind: 'number' }] },
        навыки: { label: 'Навыки', owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }], rows: [{ value: 'атлетика' }] },
      },
      sample: { field: 5, запас: 2, 'навыки.атлетика.ранг': 3 },
    } as unknown as System;
    useWorld.setState(state => ({ ...state, system: world }));
    const edit = useWorld.getState().editSystem;
    edit(draft => renameColumn(draft, 'лист', 'field', 'Сила', 'сила'));
    expect(useWorld.getState().system.sample).toEqual({ сила: 5, запас: 2, 'навыки.атлетика.ранг': 3 });
    edit(draft => renameColumn(draft, 'навыки', 'ранг', 'Уровень', 'уровень'));
    expect(useWorld.getState().system.sample).toEqual({ сила: 5, запас: 2, 'навыки.атлетика.уровень': 3 });
    edit(draft => moveTable(draft, 'навыки', 'умения'));
    expect(useWorld.getState().system.sample).toEqual({ сила: 5, запас: 2, 'умения.атлетика.уровень': 3 });
    edit(draft => { draft.tables!['лист']!.columns = draft.tables!['лист']!.columns!.filter(column => column.key !== 'запас'); });
    expect(useWorld.getState().system.sample).toEqual({ сила: 5, 'умения.атлетика.уровень': 3 });
    edit(draft => { delete draft.tables!['умения']; draft.tables!['лист']!.columns![0]!.expr = { expr: '1' }; });
    expect(useWorld.getState().system).not.toHaveProperty('sample');
  });
});
