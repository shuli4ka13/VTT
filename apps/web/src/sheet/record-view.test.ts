import { describe, it, expect } from 'vitest';
import { PLAYABLE_WORLDS } from '@vtt/engine/model/systems';
import { findRecord } from '@vtt/engine/model/owned';
import { renderHook } from '@testing-library/react';
import { useReader } from '../engine/use-calc.ts';
import { recordDetails } from './record-view.tsx';
import type { Owned, Sheet } from '@vtt/schema';

const world = PLAYABLE_WORLDS.find(one => one.system.id === 'shadowrun6')!;
const { system, compendium } = world;

const line = (id: string, label: string, at?: Parameters<typeof recordDetails>[3]) =>
  recordDetails(findRecord(compendium, id)!, system, compendium, at).find(one => one.label === label)?.value;

const counter = (sheet: Sheet) => renderHook(() => useReader(system, sheet, compendium, null)).result.current.measure!;

describe('свойства вещи: клетка-формула', () => {
  it('нигде не печатает «[object Object]»', () => {
    for (const record of compendium.records) {
      for (const one of recordDetails(record, system, compendium)) expect(one.value, `${record.id}: ${one.label}`).not.toContain('[object');
    }
  });

  it('считает от рейтинга записи', () => {
    expect(line('bow', 'Цена, ¥')).toBe('110');
    expect(line('cybereyes', 'Сущность (стандарт)')).toBe('0.1');
  });

  it('считает от рейтинга экземпляра', () => {
    const entry: Owned = { of: 'bow', values: { rating: 6 } };
    expect(line('bow', 'Цена, ¥', { entry })).toBe('160');
    expect(line('bow', 'Доступность', { entry })).toBe('2');
  });

  it('стёртый рейтинг экземпляра — как не заданный: берётся рейтинг записи', () => {
    expect(line('bow', 'Цена, ¥', { entry: { of: 'bow', values: { rating: '' } } })).toBe('110');
  });

  it('поле носителя — от листа, без листа — словами', () => {
    const sheet = world.sheets.find(one => one.name === 'Бритва')!;
    expect(line('hardened_fist', 'Базовый урон')).toBe('4, если «Сила (носитель)» ≥ 7, иначе 3');
    expect(line('hardened_fist', 'Базовый урон', { entry: { of: 'hardened_fist' }, count: counter(sheet) })).toMatch(/^[34]$/u);
  });
});
