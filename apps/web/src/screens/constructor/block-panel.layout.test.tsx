// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { pickCombo, comboOptions } from '../../testing/cards.ts';
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
    ...(withPages ? { pages: [{ key: 'Основное' }, { key: 'Магия' }] } : {}),
    blocks: [{ key: 'Навыки', parts: [{ table: 'навыки' }] }, { key: 'Внутри', parent: 'Навыки', parts: [{ table: 'лист' }] }],
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
    pickCombo(screen.getByLabelText('страница блока'), 'Магия');
    expect(sys().blocks![0]!.page).toBe('Магия');
    pickCombo(screen.getByLabelText('страница блока'), '');
    expect(sys().blocks![0]).not.toHaveProperty('page');
  });

  it('переименование меняет только подпись: ключ и ссылки прежние, занятая подпись отвергается, равная ключу не хранится', () => {
    panel('Навыки');
    const title = screen.getByPlaceholderText('как зовётся блок');
    fireEvent.change(title, { target: { value: 'Умения' } });
    fireEvent.blur(title);
    expect(sys().blocks!.map(b => [b.key, b.label, b.parent])).toEqual([['Навыки', 'Умения', undefined], ['Внутри', undefined, 'Навыки']]);
    fireEvent.change(title, { target: { value: 'Внутри' } });
    fireEvent.blur(title);
    expect(sys().blocks![0]!.label).toBe('Умения');
    fireEvent.change(title, { target: { value: 'Навыки' } });
    fireEvent.blur(title);
    expect(sys().blocks![0]).not.toHaveProperty('label');
  });

  it('«Ширина» пишет ширину ячейке, 12 снимает ключ; «Под предыдущим блоком» ставит under и снимает свою ширину', () => {
    panel('Навыки');
    pickCombo(screen.getByLabelText('ширина блока'), '5');
    expect(sys().blocks![0]!.width).toBe(5);
    pickCombo(screen.getByLabelText('ширина блока'), '12');
    expect(sys().blocks![0]).not.toHaveProperty('width');
    pickCombo(screen.getByLabelText('ширина блока'), '6');
    fireEvent.click(screen.getByLabelText('Под предыдущим блоком'));
    expect(sys().blocks![0]!.under).toBe(true);
    expect(sys().blocks![0]).not.toHaveProperty('width');
  });

  it('«Строки таблицы» — у блока с таблицей, «Поля внутри блока» — у блока с полями листа', () => {
    panel('Навыки');
    expect(screen.queryByLabelText('поля внутри блока')).toBeNull();
    pickCombo(screen.getByLabelText('строки таблицы'), '2');
    expect(sys().blocks![0]!.split).toBe(2);
    pickCombo(screen.getByLabelText('строки таблицы'), '1');
    expect(sys().blocks![0]).not.toHaveProperty('split');
    cleanup();
    panel('Внутри');
    expect(screen.queryByLabelText('строки таблицы')).toBeNull();
    pickCombo(screen.getByLabelText('поля внутри блока'), '2');
    expect(sys().blocks![1]!.per).toBe(2);
    pickCombo(screen.getByLabelText('поля внутри блока'), '');
    expect(sys().blocks![1]).not.toHaveProperty('per');
  });

  it('вложенный блок раскладывается как любой: своя ширина, страница по умолчанию — как у родителя', () => {
    panel('Внутри');
    expect(screen.getByLabelText('ширина блока')).toBeTruthy();
    expect(comboOptions(screen.getByLabelText('страница блока'))[0]!.label).toBe('как у «Навыки»');
  });

  it('«Список в блоке» ставит список и снимает его с другого блока', () => {
    panel('Навыки');
    pickCombo(screen.getByLabelText('список в блоке'), 'things');
    expect(sys().blocks![0]!.list).toBe('things');
    cleanup();
    panel('Внутри');
    pickCombo(screen.getByLabelText('список в блоке'), 'things');
    expect(sys().blocks![1]!.list).toBe('things');
    expect(sys().blocks![0]).not.toHaveProperty('list');
    pickCombo(screen.getByLabelText('список в блоке'), '');
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
        blocks: [{ key: 'Снаряжение', list: 'things', parts: [] }],
      } as unknown as System,
    }));
    panel('Снаряжение');
    fireEvent.click(screen.getByLabelText('Оружие'));
    expect(sys().blocks![0]!.kinds).toEqual(['доспех']);
    fireEvent.click(screen.getByLabelText('Оружие'));
    expect(sys().blocks![0]!.kinds).toEqual(['доспех', 'оружие']);
  });

  it('«Высота»: число пишет высоту с шагом 10, пусто снимает', () => {
    panel('Навыки');
    const input = () => screen.getByPlaceholderText('по содержимому') as HTMLInputElement;
    fireEvent.change(input(), { target: { value: '255' } });
    fireEvent.blur(input());
    expect(sys().blocks![0]!.height).toBe(260);
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.blur(input());
    expect(sys().blocks![0]).not.toHaveProperty('height');
  });

  it('без страниц у системы «Страницы» нет', () => {
    load(false);
    panel('Навыки');
    expect(screen.queryByText('Страница')).toBeNull();
  });
});
