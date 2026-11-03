// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BlockPanel } from './block-panel.tsx';
import { useWorld } from '../../store/world.ts';
import type { System } from '@vtt/schema';

const load = (withPages = true) => useWorld.setState(state => ({
  ...state,
  system: {
    ...(({ pages: _gone, ...rest }) => rest)(state.system), tables: {}, effects: {},
    ...(withPages ? { pages: [{ name: 'Основное', stacks: 2 }, { name: 'Магия' }] } : {}),
    blocks: [{ name: 'Навыки', parts: [] }, { name: 'Внутри', parent: 'Навыки', parts: [] }],
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
const segment = (label: string, value: string) => {
  const group = screen.getByText(label).closest('label')!;
  fireEvent.click([...group.querySelectorAll('button')].find(b => b.textContent === value)!);
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

  it('«Столбец» виден, когда у страницы больше одного столбца; 2 пишет stack, 1 снимает', () => {
    panel('Навыки');
    segment('Столбец', '2');
    expect(sys().blocks![0]!.stack).toBe(2);
    cleanup();
    panel('Навыки');
    segment('Столбец', '1');
    expect(sys().blocks![0]).not.toHaveProperty('stack');
    fireEvent.change(screen.getByLabelText('страница блока'), { target: { value: 'Магия' } });
    expect(screen.queryByText('Столбец')).toBeNull();
  });

  it('«Во всю ширину» и «Строки — в столбца» пишут ключи и снимают умолчания', () => {
    panel('Навыки');
    fireEvent.click(screen.getByLabelText('Во всю ширину страницы'));
    expect(sys().blocks![0]!.wide).toBe(true);
    fireEvent.click(screen.getByLabelText('Во всю ширину страницы'));
    expect(sys().blocks![0]).not.toHaveProperty('wide');
    segment('Строки — в 1/2/3 столбца', '2');
    expect(sys().blocks![0]!.split).toBe(2);
    cleanup();
    panel('Навыки');
    segment('Строки — в 1/2/3 столбца', '1');
    expect(sys().blocks![0]).not.toHaveProperty('split');
  });

  it('у вложенного блока нет «Страницы», «Столбца» и «Во всю ширину», а строки в столбцы есть', () => {
    panel('Внутри');
    expect(screen.queryByText('Страница')).toBeNull();
    expect(screen.queryByText('Столбец')).toBeNull();
    expect(screen.queryByLabelText('Во всю ширину страницы')).toBeNull();
    expect(screen.getByText('Строки — в 1/2/3 столбца')).toBeTruthy();
  });

  it('без страниц у системы «Страницы» нет', () => {
    load(false);
    panel('Навыки');
    expect(screen.queryByText('Страница')).toBeNull();
  });
});
