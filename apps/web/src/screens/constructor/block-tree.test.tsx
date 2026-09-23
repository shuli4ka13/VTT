// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { blockTree, BlockBranches } from './block-tree.tsx';
import { useOpened } from '../../store/opened.ts';
import type { System } from '@vtt/schema';

const system = {
  fields: [], effects: {},
  groups: { Механика: {}, 'Умения класса': { parent: 'Механика' }, Атака: {} },
} as unknown as System;

const items = [
  { id: 'ярость', block: 'Умения класса' },
  { id: 'второе дыхание', block: 'Умения класса' },
  { id: 'удар', block: 'Атака' },
];

const tree = () => blockTree(system, items, item => item.block);

const list = (active?: string) => render(
  <BlockBranches
    list="проба" nodes={tree()}
    {...(active ? { isActive: (item: { id: string }) => item.id === active } : {})}
    render={item => <span key={item.id}>{item.id}</span>}
  />,
);

describe('группы в списке слева сворачиваются', () => {
  beforeEach(() => { useOpened.setState({ opened: {} }); });
  afterEach(() => { cleanup(); });

  it('изначально всё закрыто: видны только верхние группы со счётчиком, вложенная прячется в родителе', () => {
    list();
    expect(screen.queryByText('ярость')).toBeNull();
    expect(screen.queryByText('Умения класса')).toBeNull();
    expect(screen.getByLabelText('развернуть «Механика»')).toBeTruthy();
    const head = screen.getByLabelText('развернуть «Механика»').closest('.list__group-head')!;
    expect(head.querySelector('.list__group-count')!.textContent).toBe('2');
  });

  it('стрелка раскрывает: «Механика» → «Умения класса» → её эффекты', () => {
    list();
    fireEvent.click(screen.getByLabelText('развернуть «Механика»'));
    expect(screen.queryByText('ярость')).toBeNull();
    fireEvent.click(screen.getByLabelText('развернуть «Умения класса»'));
    expect(screen.getByText('ярость')).toBeTruthy();
  });

  it('группа с выбранным элементом открыта вместе с родителями', () => {
    list('ярость');
    expect(screen.getByText('ярость')).toBeTruthy();
    expect(screen.queryByText('удар')).toBeNull();
  });
});
