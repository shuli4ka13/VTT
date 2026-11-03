// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PagePanel, PageBar } from './page-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const load = (pages: System['pages'], activePage: string | null = null) => useWorld.setState(state => ({
  ...state,
  system: {
    ...(({ pages: _gone, ...rest }) => rest)(state.system), tables: {}, effects: {},
    ...(pages ? { pages } : {}),
    blocks: [{ name: 'Навыки', page: 'Основное', parts: [] }, { name: 'Заклинания', page: 'Магия', parts: [] }],
  } as unknown as System,
  activePage,
}));

const sys = () => useWorld.getState().system;
function Live({ name }: { name: string }) {
  const system = useWorld(s => s.system);
  return <PagePanel name={name} system={system} />;
}
function LiveBar() {
  const system = useWorld(s => s.system);
  return <PageBar system={system} />;
}
const panel = (name: string) => render(<Live name={name} />);

describe('страницы листа в конструкторе', () => {
  afterEach(() => { cleanup(); });
  beforeEach(() => { load([{ name: 'Основное' }, { name: 'Магия' }]); });

  it('«+ страница»: первая зовётся «Основное», дальше «Страница N», новая открывается', () => {
    load(undefined);
    render(<LiveBar />);
    fireEvent.click(screen.getByText('+ страница'));
    expect(sys().pages).toEqual([{ name: 'Основное' }]);
    expect(useWorld.getState().activePage).toBe('Основное');
    cleanup();
    render(<LiveBar />);
    fireEvent.click(screen.getByText('+ страница'));
    expect(sys().pages!.map(p => p.name)).toEqual(['Основное', 'Страница 2']);
  });

  it('переименование: блоки идут следом, пустое и занятое имя не принимаются', () => {
    panel('Магия');
    const name = screen.getByPlaceholderText('как зовётся страница');
    fireEvent.change(name, { target: { value: 'Основное' } });
    fireEvent.blur(name);
    expect(sys().pages!.map(p => p.name)).toEqual(['Основное', 'Магия']);
    fireEvent.change(name, { target: { value: 'Заклинания' } });
    fireEvent.blur(name);
    expect(sys().pages!.map(p => p.name)).toEqual(['Основное', 'Заклинания']);
    expect(sys().blocks!.find(b => b.name === 'Заклинания')!.page).toBe('Заклинания');
    expect(useWorld.getState().activePage).toBe('Заклинания');
  });

  it('шапка одна: включение у другой страницы снимает прежнюю, выключение снимает ключ', () => {
    load([{ name: 'Основное', top: true }, { name: 'Магия' }]);
    panel('Магия');
    fireEvent.click(screen.getByLabelText('Над закладками — видна всегда'));
    expect(sys().pages).toEqual([{ name: 'Основное' }, { name: 'Магия', top: true }]);
    fireEvent.click(screen.getByLabelText('Над закладками — видна всегда'));
    expect(sys().pages).toEqual([{ name: 'Основное' }, { name: 'Магия' }]);
  });

  it('как стоят блоки: в два столбца пишет stacks, 1 снимает ключ', () => {
    panel('Основное');
    fireEvent.change(screen.getByLabelText('как стоят блоки'), { target: { value: '2' } });
    expect(sys().pages![0]).toEqual({ name: 'Основное', stacks: 2 });
    fireEvent.change(screen.getByLabelText('как стоят блоки'), { target: { value: '1' } });
    expect(sys().pages![0]).toEqual({ name: 'Основное' });
  });

  it('список переезжает с другой страницы; пустой массив — ключа нет', () => {
    load([{ name: 'Основное', lists: ['things', 'actions'] }, { name: 'Магия' }]);
    panel('Магия');
    fireEvent.click(screen.getByLabelText('Снаряжение'));
    expect(sys().pages).toEqual([{ name: 'Основное', lists: ['actions'] }, { name: 'Магия', lists: ['things'] }]);
    fireEvent.click(screen.getByLabelText('Снаряжение'));
    expect(sys().pages![1]).toEqual({ name: 'Магия' });
  });

  it('удаление: блоки остаются без страницы', () => {
    panel('Магия');
    fireEvent.click(screen.getByText('Удалить страницу'));
    fireEvent.click(screen.getByText('точно убрать'));
    expect(sys().pages).toEqual([{ name: 'Основное' }]);
    expect(sys().blocks!.find(b => b.name === 'Заклинания')).not.toHaveProperty('page');
  });

  it('порядок: «позже» двигает страницу', () => {
    panel('Основное');
    fireEvent.click(screen.getByText('↓ позже'));
    expect(sys().pages!.map(p => p.name)).toEqual(['Магия', 'Основное']);
  });
});
