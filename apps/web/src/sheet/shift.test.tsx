// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { calc, newPass, shiftOf, baseOf, findField } from '@vtt/engine';
import { SheetView } from './sheet-view.tsx';
import type { System, Sheet, Compendium } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  effects: {},
  blocks: [{ key: 'list', parts: [{ table: 'list', views: { armor: { kind: 'stepper' } } }] }],
  tables: {
    list: { shape: 'single', owner: 'sheet', columns: [
      { key: 'humanity', label: 'Человечность', kind: 'number', default: 60 },
      { key: 'armor', label: 'Броня', kind: 'number', default: 2, min: 0, max: 20 },
      { key: 'luck', label: 'Удача', kind: 'number', default: 5 },
      { key: 'speed', label: 'Скорость', kind: 'number', default: 10 },
    ] },
    implants: {
      label: 'Импланты', shape: 'book', use: 'item',
      columns: [{ key: 'x', kind: 'number' }],
      modifiers: [
        { kind: 'value', target: 'humanity', op: 'add', value: { expr: '-@row.x' } },
        { kind: 'value', target: 'armor', op: 'add', value: { expr: '3' } },
        { kind: 'value', target: 'speed', op: 'mul', value: { expr: '2' } },
      ],
    },
  },
} as unknown as System;

const book = { records: [{ id: 'a', table: 'implants', label: 'ААА', cells: { x: 10 } }] } as unknown as Compendium;
const sheet = { id: 's', values: { humanity: 60, armor: 2, luck: 5, speed: 10 }, has: [{ of: 'a' }], effects: [] } as unknown as Sheet;

const readerOf = (one: Sheet): Reader => {
  const pass = newPass(system as never, one as never, { compendium: book as never });
  return {
    valueOf: tag => ({ ok: true, value: calc(system as never, one as never, tag, pass) }),
    rollOf: () => null,
    storedOf: tag => baseOf(pass, findField(system as never, tag)!),
    shiftOf: tag => shiftOf(system as never, tag, pass),
  };
};

const draw = (editing: boolean) => {
  const set: [string, unknown][] = [];
  const shifted: [string, number][] = [];
  render(<SheetView system={system} sheet={sheet} reader={readerOf(sheet)} editing={editing}
    onChange={(tag, value) => { set.push([tag, value]); }} onShift={(tag, by) => { shifted.push([tag, by]); }} />);
  return { set, shifted };
};

const cellOf = (label: string) => screen.getAllByText(label)[0]!.closest('.field')!;

describe('итог под правками на листе', () => {
  afterEach(() => { cleanup(); });

  it('обычный вид: итог и разница со стрелкой, откуда — в подсказке', () => {
    draw(false);
    const humanity = cellOf('Человечность');
    expect((humanity.querySelector('input') as HTMLInputElement).value).toBe('50');
    const plaque = humanity.querySelector('.shift-plaque')!;
    expect(plaque.textContent).toBe('↓ −10');
    expect(plaque.getAttribute('title')).toContain('60');
    expect(plaque.getAttribute('title')).toContain('Импланты');
    expect(cellOf('Удача').querySelector('.shift-plaque')).toBeNull();
  });

  it('обычный вид: вписанное число — итог, основа сдвигается на разницу, итог в основу не пишется', () => {
    const { set, shifted } = draw(false);
    const input = cellOf('Человечность').querySelector('input')!;
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);
    expect(shifted).toEqual([['humanity', -5]]);
    expect(set).toEqual([]);
  });

  it('обычный вид: «плюс» у поля с видом шага сдвигает основу, а не пишет итог', () => {
    const { set, shifted } = draw(false);
    const plus = [...cellOf('Броня').querySelectorAll('button')].find(one => one.title === 'плюс')!;
    fireEvent.click(plus);
    expect(set).toEqual([]);
    expect(shifted).toEqual([['armor', 1]]);
  });

  it('обычный вид: под правкой-множителем итог только виден — вписывать его можно в режиме правки', () => {
    draw(false);
    const speed = cellOf('Скорость');
    expect(speed.querySelector('input')).toBeNull();
    expect(speed.textContent).toContain('20');
    expect(speed.querySelector('.shift-plaque')!.textContent).toBe('↑ +10');
  });

  it('режим правки: под правкой-множителем вписанное правится', () => {
    const { set } = draw(true);
    const input = cellOf('Скорость').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(set).toEqual([['speed', 12]]);
  });

  it('режим правки: вписанное значение и подсказка с итогом, ввод пишет основу', () => {
    const { set } = draw(true);
    const humanity = cellOf('Человечность');
    const input = humanity.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('60');
    expect(humanity.querySelector('.shift-plaque')!.textContent).toBe('итог 50');
    fireEvent.change(input, { target: { value: '70' } });
    fireEvent.blur(input);
    expect(set).toEqual([['humanity', 70]]);
  });
});
