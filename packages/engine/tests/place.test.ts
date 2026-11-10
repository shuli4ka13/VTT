import { describe, it, expect } from 'vitest';
import { cellsBetween, distanceOf, bandOf, measuredValue } from '../src/engine/place.ts';
import { lintSystem } from '../src/model/lint.ts';
import type { System, Param } from '../src/model/types.ts';

const system = {
  id: 'с', name: 'с', tags: {},
  grid: { step: 2, unit: 'м' },
  tables: {
    полосы: {
      label: 'Дистанции', key: 'word',
      columns: [{ key: 'от', kind: 'number', bound: 'from' }, { key: 'до', kind: 'number', bound: 'to' }],
      rows: [{ value: 'вплотную', cells: { до: 3 } }, { value: 'близко', cells: { от: 4, до: 50 } }, { value: 'далеко', cells: { от: 51 } }],
    },
  },
  effects: {
    выстрел: {
      label: 'Выстрел',
      params: [
        { key: 'метры', kind: 'number', measure: true, ask: { by: 'gm' } },
        { key: 'полоса', kind: 'choice', from: 'полосы', measure: true, ask: { by: 'actor' } },
      ],
    },
  },
} as unknown as System;

describe('поле: мера между клетками', () => {
  it('диагональ — одна клетка, через одну вдвое, по прямой', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 'one')).toBe(4);
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 'alt')).toBe(5);
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 'line')).toBe(5);
    expect(cellsBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('дистанция — клетки на шаг сетки; без места или сетки — нет', () => {
    const places = { а: { x: 0, y: 0 }, б: { x: 5, y: 1 } };
    expect(distanceOf(system, places, 'а', 'б')).toBe(10);
    expect(distanceOf(system, places, 'а', 'в')).toBeNull();
    expect(distanceOf({ ...system, grid: undefined }, places, 'а', 'б')).toBeNull();
  });

  it('полоса — строка, между границами которой мера', () => {
    expect(bandOf(system, 'полосы', 2)).toBe('вплотную');
    expect(bandOf(system, 'полосы', 10)).toBe('близко');
    expect(bandOf(system, 'полосы', 400)).toBe('далеко');
  });

  it('вход-число получает меру, вход-выбор — полосу, без отметки — ничего', () => {
    const [meters, band] = system.effects.выстрел!.params as Param[];
    expect(measuredValue(system, meters!, 10)).toBe(10);
    expect(measuredValue(system, band!, 10)).toBe('близко');
    expect(measuredValue(system, { ...meters!, measure: undefined }, 10)).toBeNull();
  });

  it('линт: мера без вопроса и выбор из таблицы без границ — ошибки', () => {
    const broken = {
      ...system,
      effects: { выстрел: { label: 'В', params: [{ key: 'м', kind: 'number', measure: true }, { key: 'п', kind: 'choice', from: 'голая', measure: true, ask: { by: 'gm' } }] } },
      tables: { ...system.tables, голая: { key: 'word', rows: [{ value: 'а' }] } },
    } as unknown as System;
    const texts = lintSystem(broken).map(problem => problem.text);
    expect(texts.some(text => text.includes('нужен вопрос'))).toBe(true);
    expect(texts.some(text => text.includes('без границ'))).toBe(true);
    expect(lintSystem(system).filter(problem => /дистанц/.test(problem.text))).toEqual([]);
  });
});
