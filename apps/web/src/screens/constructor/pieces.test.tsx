// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { world as W } from '@vtt/schema';
import { PIECES } from '@vtt/engine/model/pieces';
import { lintSystem, errorsOf } from '@vtt/engine/model/lint';

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
    expect(document.querySelector('.list__item--fresh')).toBeTruthy();

    fireEvent.click(screen.getByText('отменить'));
    expect(useWorld.getState().system.fields).toEqual([]);
    expect(screen.queryByText('что пришло')).toBeNull();
  });

  it('клик по куску кладёт его со всем, от чего он зависит, и система остаётся без ошибок', () => {
    renderOpen(<SheetTab />);
    expect(screen.getByText('Лист пуст')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Характеристики к20')[0]!);

    const system = useWorld.getState().system;
    expect(system.fields.some(f => f.group === 'Характеристики')).toBe(true);
    expect(W.system.safeParse(system).success).toBe(true);
    expect(errorsOf(lintSystem(system)).map(p => p.text)).toEqual([]);
  });

  it('вычисляемое поле в списке помечено и читается формулой словами', () => {
    renderOpen(<SheetTab />);
    fireEvent.click(screen.getAllByText('Защита')[0]!);
    cleanup();
    renderOpen(<SheetTab />);
    const metas = [...document.querySelectorAll('.list__meta')].map(node => node.textContent ?? '');
    const kinds = useWorld.getState().system.fields.map(f => f.value.kind);
    expect(kinds, metas.join(' | ')).toContain('formula');
    expect(metas.some(text => text.startsWith('вводит игрок')), metas.join(' | ')).toBe(true);
    expect(metas.some(text => text.startsWith('= ')), metas.join(' | ')).toBe(true);
  });
});

describe('вид поля на листе выбирается в конструкторе', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
      },
      activeFieldTag: 'хиты',
      activeGroupName: null,
    }));
  });

  it('выбор «полоса запаса» ложится в поле, а «обычное поле» убирает его', () => {
    renderOpen(<SheetTab />);
    const picker = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'bar'))!;
    expect(picker).toBeTruthy();

    fireEvent.change(picker, { target: { value: 'bar' } });
    expect(useWorld.getState().system.fields[0]!.control).toBe('bar');

    fireEvent.change(picker, { target: { value: '' } });
    expect('control' in useWorld.getState().system.fields[0]!).toBe(false);
  });

  it('у вычисляемого поля вида не спрашивают — его не правят руками', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        fields: [{ tag: 'мод', label: 'Мод', value: { kind: 'formula', expr: '1' } }],
      },
      activeFieldTag: 'мод',
    }));
    renderOpen(<SheetTab />);
    const picker = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value === 'bar'));
    expect(picker).toBeUndefined();
  });
});
