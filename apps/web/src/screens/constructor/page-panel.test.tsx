// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PagePanel, PageBar, movePage } from './page-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const load = (pages: System['pages'], activePage: string | null = null) => useWorld.setState(state => ({
  ...state,
  system: {
    ...(({ pages: _gone, ...rest }) => rest)(state.system), tables: {}, effects: {},
    ...(pages ? { pages } : {}),
    blocks: [{ key: 'Навыки', page: 'Основное', parts: [] }, { key: 'Заклинания', page: 'Магия', parts: [] }],
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
  beforeEach(() => { load([{ key: 'Основное' }, { key: 'Магия' }]); });

  it('«+ страница»: первая зовётся «Основное», дальше «Страница N», новая открывается', () => {
    load(undefined);
    render(<LiveBar />);
    fireEvent.click(screen.getByText('+ страница'));
    expect(sys().pages).toEqual([{ key: 'osnovnoe', label: 'Основное' }]);
    expect(useWorld.getState().activePage).toBe('osnovnoe');
    cleanup();
    render(<LiveBar />);
    fireEvent.click(screen.getByText('+ страница'));
    expect(sys().pages!.map(p => p.key)).toEqual(['osnovnoe', 'stranica_2']);
    expect(sys().pages!.map(p => p.label)).toEqual(['Основное', 'Страница 2']);
  });

  it('переименование меняет только подпись: ключ и блоки прежние, занятая и пустая подписи не принимаются, равная ключу не хранится', () => {
    panel('Магия');
    const name = screen.getByPlaceholderText('как зовётся страница');
    fireEvent.change(name, { target: { value: 'Основное' } });
    fireEvent.blur(name);
    expect(sys().pages).toEqual([{ key: 'Основное' }, { key: 'Магия' }]);
    fireEvent.change(name, { target: { value: 'Заклинания' } });
    fireEvent.blur(name);
    expect(sys().pages).toEqual([{ key: 'Основное' }, { key: 'Магия', label: 'Заклинания' }]);
    expect(sys().blocks!.find(b => b.key === 'Заклинания')!.page).toBe('Магия');
    expect(useWorld.getState().activePage).toBe(null);
    fireEvent.change(name, { target: { value: 'Магия' } });
    fireEvent.blur(name);
    expect(sys().pages).toEqual([{ key: 'Основное' }, { key: 'Магия' }]);
  });

  it('шапка одна: включение у другой страницы снимает прежнюю, выключение снимает ключ', () => {
    load([{ key: 'Основное', top: true }, { key: 'Магия' }]);
    panel('Магия');
    fireEvent.click(screen.getByLabelText('Над закладками — видна всегда'));
    expect(sys().pages).toEqual([{ key: 'Основное' }, { key: 'Магия', top: true }]);
    fireEvent.click(screen.getByLabelText('Над закладками — видна всегда'));
    expect(sys().pages).toEqual([{ key: 'Основное' }, { key: 'Магия' }]);
  });

  it('удаление: блоки остаются без страницы', () => {
    panel('Магия');
    fireEvent.click(screen.getByText('Удалить страницу'));
    fireEvent.click(screen.getByText('точно убрать'));
    expect(sys().pages).toEqual([{ key: 'Основное' }]);
    expect(sys().blocks!.find(b => b.key === 'Заклинания')).not.toHaveProperty('page');
  });

  it('порядок: перенос страницы за другую меняет порядок закладок', () => {
    useWorld.getState().editSystem(draft => movePage(draft, 'Основное', 'Магия', true));
    expect(sys().pages!.map(p => p.key)).toEqual(['Магия', 'Основное']);
  });
});
