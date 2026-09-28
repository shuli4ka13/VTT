import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dh = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'daggerheart')!;
const system = dh.system as System;
const compendium = dh.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}) => {
  const sheet = structuredClone(dh.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values } } as Sheet;
};
const tape = (...values: number[]) => () => values.shift() ?? 1;
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);

const act = (die: () => number, bran: Sheet = sheetOf('bran')) => exchange({
  system, compendium, die, sheets: [bran, sheetOf('стол')], actionId: 'act:0', fromId: 'bran', toId: 'bran',
  inputs: { trait: 'проворство', сложность: 12 },
});
const valueOf = (out: ReturnType<typeof exchange>, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];

group('Daggerheart: кости двойственности', () => {
  test('больше на Надежде — герой получает Надежду', () => {
    const out = act(tape(10, 3));
    eq(valueOf(out, 'bran', 'hope'), 3);
    eq(valueOf(out, 'стол', 'fear'), 0);
  });

  test('больше на Страхе — ведущий получает Страх', () => {
    const out = act(tape(3, 10));
    eq(valueOf(out, 'bran', 'hope'), 2);
    eq(valueOf(out, 'стол', 'fear'), 1);
  });

  test('одинаково — крит: Надежда и минус один Стресс', () => {
    const out = act(tape(5, 5), sheetOf('bran', { stress: 2 }));
    eq(valueOf(out, 'bran', 'hope'), 3);
    eq(valueOf(out, 'bran', 'stress'), 1);
  });
});

group('Daggerheart: урон по порогам', () => {
  test('атака героя: урон 11 против порогов 8/14 разбойника — две клетки хитов, Надежда атакующему', () => {
    const out = exchange({
      system, compendium, die: tape(9, 4, 8), sheets: [sheetOf('bran'), sheetOf('bandit'), sheetOf('стол')],
      actionId: 'longsword:0', fromId: 'bran', toId: 'bandit',
    });
    eq(valueOf(out, 'bandit', 'hp'), 2);
    eq(valueOf(out, 'bran', 'hope'), 3);
  });

  test('атака противника: урон 8 против порогов 8/16 — две клетки, свободный бронеслот снимает одну', () => {
    const out = exchange({
      system, compendium, die: tape(15, 7), sheets: [sheetOf('bandit'), sheetOf('bran'), sheetOf('стол')],
      actionId: 'bandit_knife:0', fromId: 'bandit', toId: 'bran',
    });
    eq(valueOf(out, 'bran', 'hp'), 1);
    eq(valueOf(out, 'bran', 'armor_marked'), 1);
  });

  test('отмечен последний хит — смертельный ход', () => {
    const out = exchange({
      system, compendium, die: tape(15, 7), sheets: [sheetOf('bandit'), sheetOf('bran', { hp: 5, armor_marked: 4 }), sheetOf('стол')],
      actionId: 'bandit_knife:0', fromId: 'bandit', toId: 'bran',
    });
    ok(wears(out.sheets.find(s => s.id === 'bran'), 'death_move'));
  });
});
