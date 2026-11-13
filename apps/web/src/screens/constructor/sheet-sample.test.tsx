// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    fireEvent.change(screen.getByLabelText('добавить образец'), { target: { value: 'оружие' } });
    expect(screen.getByText('Оружие 1')).toBeTruthy();
    expect(useWorld.getState().system).toBe(system);
    expect(document.body.textContent).toMatch(/Урон: \d+/);
    expect(screen.getByText('Оружие 1').closest('.card')!.querySelector('input')).toBeNull();
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
    fireEvent.change(screen.getByLabelText('добавить образец'), { target: { value: 'оружие' } });
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
