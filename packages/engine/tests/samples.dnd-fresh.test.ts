import { describe, it, expect } from 'vitest';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(world => (world.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const book = dnd.compendium;

const world = (sheets: Sheet[]) => ({ system, compendium: book, clock: null, sheets, die: () => 1, newId: () => 'новичок' });
const read = (sheet: Sheet, tag: string): unknown => calc(system, sheet, tag, newPass(system, sheet, { compendium: book }));
const mine = (out: { sheets: Sheet[] }): Sheet => out.sheets.find(sheet => sheet.id === 'новичок')!;

describe('D&D: новый лист', () => {
  const made = mine(perform(world([]), { op: 'sheet', name: 'Новичок', of: 'personazh' }));

  it('характеристики — 10, модификаторы — ноль', () => {
    for (const ability of ['sila', 'lovkost', 'teloslozhenie', 'intellekt', 'mudrost', 'harizma']) {
      expect(read(made, `abilities.${ability}.score`), ability).toBe(10);
      expect(read(made, `abilities.${ability}.mod`), ability).toBe(0);
    }
  });

  it('хиты не вписаны и равны максимуму; без класса максимум — ноль, но лист не «без сил»', () => {
    expect(Object.hasOwn(made.values, 'hp_current')).toBe(false);
    expect(read(made, 'hp_max')).toBe(0);
    expect(read(made, 'hp_current')).toBe(0);
    expect(read(made, 'down')).toBe(false);
    expect(read(made, 'up')).toBe(true);
  });

  const chosen = perform(world([made]), { op: 'set', sheetId: 'новичок', tag: 'class_name', value: 'voin' });
  const classed = mine(chosen);
  const max = Number(read(classed, 'hp_max'));

  it('выбор класса не пишет в журнал стола ничего: «встал» — это про упавшего, а не про нового', () => {
    expect(chosen.log).toEqual([]);
  });

  it('выбрали класс — хиты полные, герой на ногах, лишних состояний нет', () => {
    expect(max).toBeGreaterThan(0);
    expect(read(classed, 'hp_current')).toBe(max);
    expect(read(classed, 'up')).toBe(true);
    expect(read(classed, 'down')).toBe(false);
    expect(Object.hasOwn(classed.values, 'hp_current')).toBe(false);
    expect(classed.effects ?? []).toEqual([]);
  });

  it('урон сдвигом считается от максимума и вписывается', () => {
    const hurt = mine(perform(world([classed]), { op: 'shift', sheetId: 'новичок', tag: 'hp_current', by: -3 }));
    expect(hurt.values.hp_current).toBe(max - 3);
  });

  it('урон действием считается от максимума и вписывается; рост уровня вписанное не трогает', () => {
    const orc = structuredClone(dnd.sheets.find(sheet => sheet.id === 'orc')!) as Sheet;
    const out = exchange({ system, compendium: book, die: () => 15, sheets: [orc, classed], actionId: 'orc_greataxe:0', fromId: 'orc', toId: 'новичок' });
    const hit = mine(out);
    const left = Number(hit.values.hp_current);
    expect(Object.hasOwn(hit.values, 'hp_current')).toBe(true);
    expect(left).toBeLessThan(max);
    expect(left).toBeGreaterThanOrEqual(0);
    const grown = mine(perform(world([hit]), { op: 'set', sheetId: 'новичок', tag: 'level', value: 5 }));
    expect(Number(read(grown, 'hp_max'))).toBeGreaterThan(max);
    expect(grown.values.hp_current).toBe(left);
  });
});
