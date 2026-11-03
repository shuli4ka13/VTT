// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BlockPanel } from './block-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const load = (withPages = true) => useWorld.setState(state => ({
  ...state,
  system: {
    ...(({ pages: _gone, ...rest }) => rest)(state.system), effects: {},
    tables: {
      лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number' }] },
      навыки: { owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }], rows: [{ value: 'атлетика' }] },
    },
    ...(withPages ? { pages: [{ name: 'Основное', stacks: 2 }, { name: 'Магия' }] } : {}),
    blocks: [{ name: 'Навыки', parts: [{ table: 'навыки' }] }, { name: 'Внутри', parent: 'Навыки', parts: [{ table: 'лист' }] }],
  } as unknown as System,
}));

const sys = () => useWorld.getState().system;
function Live({ name }: { name: string }) {
  const system = useWorld(s => s.system);
  return <BlockPanel name={name} system={system} />;
}
const panel = (name: string) => {
  const out = render(<Live name={name} />);
  document.querySelectorAll('details').forEach(d => { d.open = true; });
  return out;
};

describe('раскладка блока', () => {
  afterEach(() => { cleanup(); });
  beforeEach(() => { load(); });

  it('«Страница» пишет page, первая закладка снимает ключ', () => {
    panel('Навыки');
    fireEvent.change(screen.getByLabelText('страница блока'), { target: { value: 'Магия' } });
    expect(sys().blocks![0]!.page).toBe('Магия');
    fireEvent.change(screen.getByLabelText('страница блока'), { target: { value: '' } });
    expect(sys().blocks![0]).not.toHaveProperty('page');
  });

  it('«Место на странице» видно, когда блоки стоят столбцами; пишет stack или wide, левый снимает оба', () => {
    panel('Навыки');
    fireEvent.change(screen.getByLabelText('место на странице'), { target: { value: '2' } });
    expect(sys().blocks![0]!.stack).toBe(2);
    fireEvent.change(screen.getByLabelText('место на странице'), { target: { value: 'wide' } });
    expect(sys().blocks![0]!.wide).toBe(true);
    expect(sys().blocks![0]).not.toHaveProperty('stack');
    fireEvent.change(screen.getByLabelText('место на странице'), { target: { value: '1' } });
    expect(sys().blocks![0]).not.toHaveProperty('wide');
    expect(sys().blocks![0]).not.toHaveProperty('stack');
    fireEvent.change(screen.getByLabelText('страница блока'), { target: { value: 'Магия' } });
    expect(screen.queryByLabelText('место на странице')).toBeNull();
  });

  it('«Строки таблицы» — у блока с таблицей, «Поля внутри блока» — у блока с полями листа', () => {
    panel('Навыки');
    expect(screen.queryByLabelText('поля внутри блока')).toBeNull();
    fireEvent.change(screen.getByLabelText('строки таблицы'), { target: { value: '2' } });
    expect(sys().blocks![0]!.split).toBe(2);
    fireEvent.change(screen.getByLabelText('строки таблицы'), { target: { value: '1' } });
    expect(sys().blocks![0]).not.toHaveProperty('split');
    cleanup();
    panel('Внутри');
    expect(screen.queryByLabelText('строки таблицы')).toBeNull();
    fireEvent.change(screen.getByLabelText('поля внутри блока'), { target: { value: '2' } });
    expect(sys().blocks![1]!.per).toBe(2);
    fireEvent.change(screen.getByLabelText('поля внутри блока'), { target: { value: '' } });
    expect(sys().blocks![1]).not.toHaveProperty('per');
  });

  it('у вложенного блока нет «Страницы» и «Места на странице»', () => {
    panel('Внутри');
    expect(screen.queryByText('Страница')).toBeNull();
    expect(screen.queryByLabelText('место на странице')).toBeNull();
  });

  it('«Список в блоке» ставит список и снимает его с другого блока', () => {
    panel('Навыки');
    fireEvent.change(screen.getByLabelText('список в блоке'), { target: { value: 'things' } });
    expect(sys().blocks![0]!.list).toBe('things');
    cleanup();
    panel('Внутри');
    fireEvent.change(screen.getByLabelText('список в блоке'), { target: { value: 'things' } });
    expect(sys().blocks![1]!.list).toBe('things');
    expect(sys().blocks![0]).not.toHaveProperty('list');
    fireEvent.change(screen.getByLabelText('список в блоке'), { target: { value: '' } });
    expect(sys().blocks![1]).not.toHaveProperty('list');
  });

  it('у блока со снаряжением — «Типы в списке»: снятый тип пропадает, возвращённый встаёт в конец', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: {
          оружие: { label: 'Оружие', shape: 'book', use: 'item', columns: [] },
          доспех: { label: 'Доспех', shape: 'book', use: 'item', columns: [] },
        },
        blocks: [{ name: 'Снаряжение', list: 'things', parts: [] }],
      } as unknown as System,
    }));
    panel('Снаряжение');
    fireEvent.click(screen.getByLabelText('Оружие'));
    expect(sys().blocks![0]!.kinds).toEqual(['доспех']);
    fireEvent.click(screen.getByLabelText('Оружие'));
    expect(sys().blocks![0]!.kinds).toEqual(['доспех', 'оружие']);
  });

  it('без страниц у системы «Страницы» нет', () => {
    load(false);
    panel('Навыки');
    expect(screen.queryByText('Страница')).toBeNull();
  });
});
