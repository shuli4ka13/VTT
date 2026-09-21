// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { WhatNext, meddlersOf } from './what-next.tsx';
import { DRAWER_LEAVE_MS } from '../../../ui/primitives.tsx';
import type { System } from '@vtt/schema';

const system = {
  fields: [
    { tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'taken_0', label: 'Рубящий', value: { kind: 'stored', type: 'number', default: 1 } },
    { tag: 'taken_1', label: 'Огонь', value: { kind: 'stored', type: 'number', default: 1 } },
  ],
  constants: {},
  effects: {
    damage: {
      label: 'Урон',
      steps: [
        { id: 'по_хитам', type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { ref: 'event.amount' } },
      ],
    },
    taken_rule: {
      label: 'Что доходит до меня', activation: 'passive',
      modifiers: [
        { kind: 'value', target: 'event:damage', op: 'mul', value: { expr: '@taken_0' }, tags: ['рубящий'] },
        { kind: 'value', target: 'event:damage', op: 'mul', value: { expr: '@taken_1' }, tags: ['огонь'] },
      ],
    },
    stone: {
      label: 'Каменная кожа', activation: 'passive',
      modifiers: [{ kind: 'value', target: 'event:damage', op: 'mul', value: { const: 0.5 }, tags: ['рубящий'] }],
    },
    other: {
      label: 'Не сюда', activation: 'passive',
      modifiers: [{ kind: 'value', target: 'event:healing', op: 'mul', value: { const: 2 }, tags: [] }],
    },
  },
} as unknown as System;

afterEach(() => { cleanup(); });

describe('кто вмешается по дороге', () => {
  it('одно правило с десятком меток — одна строка, а не десяток', () => {
    const found = meddlersOf(system, 'damage');
    expect(found).toHaveLength(2);
    expect(found[0]!.by).toBe('Что доходит до меня');
    expect(found[0]!.tags).toEqual(['рубящий', 'огонь']);
    expect(found[0]!.each, 'у каждой метки своё поле').toBe(true);
  });

  it('одинаковое значение называется прямо, правка чужого вызова не считается', () => {
    const found = meddlersOf(system, 'damage');
    expect(found[1]!.how).toBe('умножает на 0.5');
    expect(found.some(m => m.by === 'Не сюда')).toBe(false);
  });
});

describe('WhatNext', () => {
  it('показывает, что сделает цель, человеческими словами', () => {
    render(<WhatNext open system={system} eventId="damage" onClose={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Урон')).toBeTruthy();
    expect(screen.getByText(/присланное число/), 'event.amount не машинным ключом').toBeTruthy();
    expect(screen.getByText(/«Хиты»/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('event.amount');
  });

  it('Esc и клик по фону закрывают — но только когда уход дорисован', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<WhatNext open system={system} eventId="damage" onClose={onClose} onEdit={() => {}} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.querySelector('.drawer--leaving'), 'панель уходит').toBeTruthy();
      expect(onClose, 'пока уходит — вызвавший ещё не трогаем').not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(DRAWER_LEAVE_MS); });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('второй Esc по дороге не считается вторым закрытием', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<WhatNext open system={system} eventId="damage" onClose={onClose} onEdit={() => {}} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(document.querySelector('.drawer__veil')!);
      act(() => { vi.advanceTimersByTime(DRAWER_LEAVE_MS * 3); });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('закрытая панель ничего не держит в теле страницы', () => {
    render(<WhatNext open={false} system={system} eventId="damage" onClose={() => {}} onEdit={() => {}} />);
    expect(document.querySelector('.drawer')).toBeNull();
  });
});
