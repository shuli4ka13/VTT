// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HandlerCard } from './handler-card.tsx';
import type { System, Handler } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', tables: {}, constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', steps: [{ id: 'hit', type: 'threshold', roll: { die: { constant: 'd20' } }, versus: { expr: '10' } }] },
    r: { label: 'r', activation: 'passive', on: [] },
  },
} as unknown as System;

const card = (handler: Handler) => {
  let current = structuredClone(handler);
  const view = render(<HandlerCard id="r" index={0} handler={current} system={system} onRemove={() => {}}
    edit={change => { change(current); current = structuredClone(current); }} />);
  return { view, get: () => current };
};

const conditionSelect = () => [...document.querySelectorAll('select')]
  .find(el => [...el.options].some(o => o.textContent === 'формулой…'))!;

describe('«когда»: исходы под момент', () => {
  afterEach(cleanup);

  it('«на цель» предлагает итог шага цели как есть', () => {
    card({ on: 'acted', of: 'удар', steps: [] });
    expect([...conditionSelect().options].map(o => o.value)).toContain('@hit.success');
  });

  it('«я совершил действие» предлагает итог через таблицу целей', () => {
    const { get } = card({ on: 'done', of: 'удар', steps: [] });
    const select = conditionSelect();
    expect([...select.options].map(o => o.value)).toContain('сколько(@цели.hit.success, да) >= 1');
    expect([...select.options].map(o => o.value)).not.toContain('@hit.success');
    fireEvent.change(select, { target: { value: 'сколько(@цели.hit.success, да) >= 1' } });
    expect(get().if?.expr).toBe('сколько(@цели.hit.success, да) >= 1');
  });

  it('у «я совершил действие» нет выбора «Кому»', () => {
    const { view } = card({ on: 'done', steps: [] });
    expect(view.container.textContent).not.toContain('Кому');
  });
});
