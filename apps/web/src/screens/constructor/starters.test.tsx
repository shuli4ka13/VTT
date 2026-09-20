// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { startersOf } from './starters.tsx';
import { world as W } from '@vtt/schema';

describe('стартовые блоки на пустом листе', () => {
  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: emptySystem(), activeFieldTag: null, activeGroupName: null }));
  });
  afterEach(() => { cleanup(); });

  it('каждый стартовый блок есть в образце, из которого его берут', () => {
    expect(startersOf().map(s => s.label)).toEqual(['Характеристики к20', 'Хиты', 'Защита', 'Навыки RED']);
  });

  it('клик по стартовому блоку кладёт поля и оставляет систему верной', () => {
    render(<SheetTab />);
    expect(screen.getByText('Лист пуст')).toBeTruthy();

    fireEvent.click(screen.getByText('Характеристики к20'));

    const system = useWorld.getState().system;
    expect(system.fields.length).toBeGreaterThan(3);
    expect(system.fields.some(f => f.group === 'Характеристики')).toBe(true);
    expect(W.system.safeParse(system).success).toBe(true);
  });

  it('вычисляемое поле в списке помечено и читается формулой словами', () => {
    render(<SheetTab />);
    fireEvent.click(screen.getAllByText('Защита')[0]!);
    cleanup();
    render(<SheetTab />);
    const metas = [...document.querySelectorAll('.list__meta')].map(node => node.textContent ?? '');
    const kinds = useWorld.getState().system.fields.map(f => f.value.kind);
    expect(kinds, metas.join(' | ')).toContain('formula');
    expect(metas.some(text => text.startsWith('вводит игрок')), metas.join(' | ')).toBe(true);
    expect(metas.some(text => text.startsWith('= ')), metas.join(' | ')).toBe(true);
  });
});
