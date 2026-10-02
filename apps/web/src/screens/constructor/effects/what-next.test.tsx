// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { WhatNext, meddlersOf } from './what-next.tsx';
import { DRAWER_LEAVE_MS } from '../../../ui/primitives.tsx';
import type { System } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'hp', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'taken_0', label: 'Рубящий', kind: 'number', default: 1 },
    { key: 'taken_1', label: 'Огонь', kind: 'number', default: 1 },
  ] } },
  constants: {},
  effects: {
    damage: {
      label: 'Урон',
      params: [
        { key: 'раненый', label: 'Раненый', kind: 'sheet' },
        { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
      ],
      steps: [
        { id: 'по_хитам', type: 'apply', target: { expr: '@раненый.hp' }, direction: 'subtract', value: { expr: '@сколько' } },
      ],
    },
    taken_rule: {
      label: 'Что доходит до листа', activation: 'passive',
      modifiers: [
        { kind: 'edit', call: 'damage', param: 'amount', op: 'mul', value: { expr: '@taken_0' }, anyTags: ['рубящий'] },
        { kind: 'edit', call: 'damage', param: 'amount', op: 'mul', value: { expr: '@taken_1' }, anyTags: ['огонь'] },
      ],
    },
    stone: {
      label: 'Каменная кожа', activation: 'passive',
      modifiers: [{ kind: 'edit', call: 'damage', param: 'amount', op: 'mul', value: { expr: '0.5' }, anyTags: ['рубящий'] }],
    },
    other: {
      label: 'Не сюда', activation: 'passive',
      modifiers: [{ kind: 'edit', call: 'healing', param: 'amount', op: 'mul', value: { expr: '2' }, anyTags: [] }],
    },
  },
} as unknown as System;

afterEach(() => { cleanup(); });

describe('кто вмешается по дороге', () => {
  it('одно правило с десятком меток — одна строка, а не десяток', () => {
    const found = meddlersOf(system, 'damage');
    expect(found).toHaveLength(2);
    expect(found[0]!.by).toBe('Что доходит до листа');
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
    expect(screen.getByText(/«Хиты» \(Раненый\)/), 'поле названо лейблом и листом').toBeTruthy();
    expect(screen.getByText(/вход «Сколько»/), 'число названо входом, а не машинным ключом').toBeTruthy();
    expect(document.body.textContent).not.toContain('@сколько');
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
