// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { openAll } from '../../../testing/render-open.tsx';
import { HandlerCard } from './handler-card.tsx';
import { within } from '../../../testing/cards.ts';
import type { System, Handler } from '@vtt/schema';

const system = {
  id: 'x', name: 'x', tables: {}, constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }], steps: [
      { id: 'hit_бросок', type: 'roll', die: 'd20', by: { expr: '@действующий' } },
      { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '10' } },
    ] },
    r: { label: 'r', activation: 'passive', on: [] },
  },
} as unknown as System;

const card = (handler: Handler) => {
  let current = structuredClone(handler);
  const withHandler = { ...system, effects: { ...system.effects, r: { ...system.effects.r, on: [current] } } } as System;
  const view = render(<HandlerCard id="r" index={0} handler={current} system={withHandler} onRemove={() => {}}
    edit={change => { change(current); current = structuredClone(current); }} />);
  openAll();
  return { view, get: () => current };
};

const conditionSelect = (): HTMLSelectElement => {
  const find = () => [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.textContent === 'формулой…'));
  if (!find()) fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === '+ условие')!);
  return find()!;
};

describe('«когда»: исходы под момент', () => {
  afterEach(cleanup);

  it('«после» действия предлагает итог шага цели как есть', () => {
    card({ on: 'after:удар', steps: [] });
    expect([...conditionSelect().options].map(o => o.value)).toContain('@hit.success');
  });

  it('«завершено» не предлагает итог одной цели: условие — формулой, и она знает таблицу итогов по целям', () => {
    const { get } = card({ on: 'done:удар', steps: [] });
    fireEvent.change(conditionSelect(), { target: { value: ':формула' } });
    expect(document.querySelector('.cond__formula')).toBeTruthy();
    expect(get().if).toBeUndefined();
    within(document.body).formula(document.querySelector<HTMLElement>('.cond__formula')!, 'сколько(@итоги.hit.success, да) >= 2');
    expect(get().if?.expr).toBe('сколько(@итоги.hit.success, да) >= 2');
    cleanup();
    const { view } = card({ on: 'done:удар', if: { expr: 'сколько(@итоги.hit.success, да) >= 2' }, steps: [] });
    expect(view.container.querySelector('.cond__formula')).toBeTruthy();
    expect([...view.container.querySelectorAll<HTMLInputElement>('.cond__formula input')].map(i => i.value)).toEqual(['сколько(@итоги.hit.success, да) >= 2']);
  });

  it('у «завершено» нет выбора «Кому», зато есть «Кого касается»', () => {
    const { view } = card({ on: 'done:удар', steps: [] });
    expect(view.container.textContent).not.toContain('Кому');
    expect(view.container.textContent).toContain('Кого касается');
  });

  it('«Когда именно» пишет фазу в «что случилось»', () => {
    const { view, get } = card({ on: 'before:удар', steps: [] });
    const phase = view.getByDisplayValue('до') as HTMLSelectElement;
    fireEvent.change(phase, { target: { value: 'after' } });
    expect(get().on).toBe('after:удар');
  });
});

describe('«увидев кости»', () => {
  afterEach(cleanup);

  it('«Кого касается» называет бросающего и того, против кого бросают; выбор пишется условием про носителя', () => {
    const { view, get } = card({ on: 'seen', steps: [] });
    const whose = view.getByDisplayValue('всех — без условия') as HTMLSelectElement;
    expect([...whose.options].map(o => o.value)).toEqual(['', '@бросающий == @носитель', '@против == @носитель']);
    expect([...whose.options].map(o => o.textContent)).toEqual(['всех — без условия', '«кто бросает» — носитель', '«против кого бросок» — носитель']);
    fireEvent.change(whose, { target: { value: '@против == @носитель' } });
    expect(get().if?.expr).toBe('@против == @носитель');
  });

  it('уход с момента стирает условие про носителя', () => {
    const { view, get } = card({ on: 'seen', if: { expr: '@бросающий == @носитель' }, steps: [] });
    const moment = [...view.container.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'seen'))!;
    fireEvent.change(moment, { target: { value: 'call' } });
    expect(get().if).toBeUndefined();
    expect(get().on).toBe('before:*');
  });
});
