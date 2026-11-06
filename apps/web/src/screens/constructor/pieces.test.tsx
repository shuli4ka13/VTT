// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { world as W } from '@vtt/schema';
import { PIECES } from '@vtt/engine/model/pieces';
import { lintSystem, errorsOf } from '@vtt/engine/model/lint';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

describe('куски на пустом листе', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: emptySystem(), activeFieldTag: null, activeGroupName: null }));
  });
  afterEach(() => { cleanup(); });

  it('пустой лист предлагает все куски систем', () => {
    renderOpen(<SheetTab />);
    const titles = [...document.querySelectorAll('.card--pick .card__title')].map(node => node.textContent ?? '');
    for (const piece of PIECES) expect(titles, piece.label).toContain(piece.label);
  });

  it('после вставки видно, что пришло, и вставку можно отменить', () => {
    renderOpen(<SheetTab />);
    fireEvent.click(screen.getAllByText('Характеристики к20')[0]!);
    expect(screen.getByText('что пришло')).toBeTruthy();
    expect(screen.getAllByText('Сила').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('отменить'));
    expect(fieldsOf(useWorld.getState().system)).toEqual([]);
    expect(screen.queryByText('что пришло')).toBeNull();
  });

  it('клик по куску кладёт его со всем, от чего он зависит, и система остаётся без ошибок', () => {
    renderOpen(<SheetTab />);

    fireEvent.click(screen.getAllByText('Характеристики к20')[0]!);

    const system = useWorld.getState().system;
    expect(fieldsOf(system).some(f => f.group === 'Характеристики')).toBe(true);
    expect(W.system.safeParse(system).success).toBe(true);
    expect(errorsOf(lintSystem(system)).map(p => p.text)).toEqual([]);
  });

  it('образец показывает посчитанное, а не формулы', () => {
    renderOpen(<SheetTab />);
    fireEvent.click(screen.getAllByText('Защита')[0]!);
    expect(fieldsOf(useWorld.getState().system).some(f => f.value.kind === 'formula')).toBe(true);
    expect(screen.getAllByText('Класс брони').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('@');
  });
});

describe('вид поля на листе выбирается в конструкторе', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 10 }] } },
        blocks: [{ name: 'Здоровье', parts: [{ table: 'лист' }] }],
      },
      activeFieldTag: 'хиты',
      activeGroupName: null,
    }));
  });

  const gallery = (name = 'Вид') => screen.getByRole('radiogroup', { name });
  const tile = (name: string, group = 'Вид') => within(gallery(group)).getByRole('radio', { name });
  const part = () => useWorld.getState().system.blocks![0]!.parts[0]!;

  it('плитка «Полоса» ложится в блок, а не в таблицу; «Как есть» убирает вид', () => {
    renderOpen(<SheetTab />);
    fireEvent.click(tile('Полоса'));
    expect(fieldsOf(useWorld.getState().system)[0]!.control).toEqual({ kind: 'bar' });
    expect(part().views).toEqual({ хиты: { kind: 'bar' } });
    expect('control' in useWorld.getState().system.tables!.лист!.columns![0]!).toBe(false);
    expect(tile('Полоса').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(tile('Как есть'));
    expect(part().views).toBeUndefined();
  });

  it('«Точки» без верха: плитка и панель говорят, чего не хватает; «+ колонка для верха» заводит колонку и ссылку', () => {
    renderOpen(<SheetTab />);
    expect(tile('Точки').textContent).toContain('нужен верх');
    fireEvent.click(tile('Точки'));
    expect(screen.getByText(/не хватает: верх/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ колонка для верха' }));
    const columns = useWorld.getState().system.tables!.лист!.columns!;
    expect(columns.map(c => c.key)).toEqual(['хиты_max', 'хиты']);
    expect(columns[1]!.max).toEqual({ expr: '@хиты_max' });
    expect(screen.queryByText(/не хватает: верх/)).toBeNull();
  });

  it('в «блоках и типах листов» редактор поля открывается слева, а не в общем списке', () => {
    renderOpen(<SheetTab />);
    fireEvent.click(screen.getByRole('button', { name: 'блоки и типы листов' }));
    act(() => { useWorld.setState(state => ({ ...state, activeFieldTag: null })); });
    fireEvent.click(screen.getAllByRole('button', { name: 'Хиты' }).find(b => b.closest('.column--main'))!);
    const side = document.querySelector('.column--side')!;
    const main = document.querySelector('.column--main')!;
    expect(side.querySelector('[role="radiogroup"][aria-label="Вид"]')).toBeTruthy();
    expect(main.querySelector('[role="radiogroup"][aria-label="Вид"]')).toBeNull();
  });

  it('посчитанному полю предлагают только виды показа', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'мод', label: 'Мод', expr: { expr: '1' } }] } },
        blocks: [{ name: 'Здоровье', parts: [{ table: 'лист' }] }],
      },
      activeFieldTag: 'мод',
    }));
    renderOpen(<SheetTab />);
    expect(within(gallery()).queryByRole('radio', { name: 'Минус и плюс' })).toBeNull();
    fireEvent.click(tile('Со знаком'));
    expect(part().views).toEqual({ мод: { kind: 'signed' } });
  });

  it('у одной строки в блоке свой вид, «Как у колонки» снимает его', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { навыки: { owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }],
          rows: [{ value: 'атлетика', label: 'Атлетика' }, { value: 'скрытность', label: 'Скрытность' }] } },
        blocks: [{ name: 'Навыки', parts: [{ table: 'навыки', views: { ранг: { kind: 'stepper', step: 2 } } }] }],
      } as never,
      activeFieldTag: 'навыки.атлетика.ранг',
    }));
    renderOpen(<SheetTab />);
    const group = screen.getAllByRole('radiogroup').find(el => /^Вид «/.test(el.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(within(group).getByRole('radio', { name: 'Точки' }));
    expect(part().views).toEqual({ ранг: { kind: 'stepper', step: 2 }, 'атлетика.ранг': { kind: 'pips' } });
    fireEvent.click(within(group).getByRole('radio', { name: 'Как у колонки' }));
    expect(part().views).toEqual({ ранг: { kind: 'stepper', step: 2 } });
  });

  it('вид колонки ложится в ту часть блока, через которую выбрана строка', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { навыки: { owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }],
          rows: [{ value: 'атлетика', label: 'Атлетика' }, { value: 'скрытность', label: 'Скрытность' }] } },
        blocks: [{ name: 'Навыки', parts: [{ table: 'навыки', rows: ['атлетика'] }, { table: 'навыки', rows: ['скрытность'] }] }],
      } as never,
      activeFieldTag: 'навыки.скрытность.ранг',
      activeIn: 'Навыки',
    }));
    renderOpen(<SheetTab />);
    fireEvent.click(tile('Полоса'));
    const parts = useWorld.getState().system.blocks![0]!.parts;
    expect(parts[0]!.views).toBeUndefined();
    expect(parts[1]!.views).toEqual({ ранг: { kind: 'bar' } });
    expect(fieldsOf(useWorld.getState().system).find(f => f.tag === 'навыки.скрытность.ранг')!.control).toEqual({ kind: 'bar' });
  });
});
