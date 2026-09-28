import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { calc, newPass } from '../src/engine/calc.ts';
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
const valueOf = (out: ReturnType<typeof exchange>, id: string, tag: string) => out.sheets.find(s => s.id === id)!.values[tag];
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));

const act = (die: () => number, bran: Sheet = sheetOf('bran'), опыт = 0) => exchange({
  system, compendium, die, sheets: [bran, sheetOf('стол')], actionId: 'act:0', fromId: 'bran', toId: 'bran',
  inputs: { trait: 'проворство', опыт, сложность: 12 },
});

group('Daggerheart: герой по SRD', () => {
  test('класс, происхождение и доспех считают уклонение, хиты, Стресс и пороги', () => {
    const bran = sheetOf('bran');
    eq(computed(bran, 'evasion'), 10, 'Воин 11, кольчуга −1');
    eq(computed(bran, 'hp_max'), 6);
    eq(computed(bran, 'stress_max'), 7, 'человек: +1 клетка Стресса');
    eq(computed(bran, 'major'), 8, 'кольчуга 7 + уровень 1');
    eq(computed(bran, 'severe'), 16);
    eq(computed(sheetOf('toma'), 'major'), 9, 'галапа: + мастерство к порогам');
  });

  test('без доспеха пороги — уровень и двойной уровень', () => {
    const bare = { ...sheetOf('bran'), has: [] } as Sheet;
    eq(computed(bare, 'major'), 1);
    eq(computed(bare, 'severe'), 2);
  });
});

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

  test('опыт стоит Надежды и даёт +2', () => {
    const out = act(tape(3, 10), sheetOf('bran'), 2);
    eq(valueOf(out, 'bran', 'hope'), 1);
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

  test('атака противника: урон 9 против порогов 8/16 — две клетки; бронеслот игрок отмечает сам', () => {
    const hit = exchange({
      system, compendium, die: tape(15, 8), sheets: [sheetOf('bandit'), sheetOf('bran'), sheetOf('стол')],
      actionId: 'bandit_daggers:0', fromId: 'bandit', toId: 'bran',
    });
    eq(valueOf(hit, 'bran', 'hp'), 2);
    const hurt = hit.sheets.find(s => s.id === 'bran')!;
    const slot = exchange({ system, compendium, die: tape(), sheets: [hurt, sheetOf('стол')], actionId: 'armor_slot:0', fromId: 'bran', toId: 'bran' });
    eq(valueOf(slot, 'bran', 'hp'), 1);
    eq(valueOf(slot, 'bran', 'armor_marked'), 1);
  });

  test('отмечен последний хит — смертельный ход', () => {
    const out = exchange({
      system, compendium, die: tape(15, 8), sheets: [sheetOf('bandit'), sheetOf('bran', { hp: 5 }), sheetOf('стол')],
      actionId: 'bandit_daggers:0', fromId: 'bandit', toId: 'bran',
    });
    ok(wears(out.sheets.find(s => s.id === 'bran'), 'death_move'));
  });

  test('весь Стресс отмечен — уязвим', () => {
    const out = exchange({
      system, compendium, die: tape(1, 1), sheets: [sheetOf('bran', { stress: 7 }), sheetOf('стол')],
      actionId: 'act:0', fromId: 'bran', toId: 'bran', inputs: { trait: 'проворство', опыт: 0, сложность: 12 },
    });
    eq(valueOf(out, 'bran', 'stress'), 6, 'крит снял Стресс');
    ok(!wears(out.sheets.find(s => s.id === 'bran'), 'vulnerable'));
  });
});

group('Daggerheart: смертельные ходы', () => {
  test('«Рискнуть всем»: больше на Страхе — смерть', () => {
    const out = exchange({
      system, compendium, die: tape(2, 9), sheets: [sheetOf('bran', { hp: 6 }), sheetOf('стол')],
      actionId: 'death_risk:0', fromId: 'bran', toId: 'bran',
    });
    ok(wears(out.sheets.find(s => s.id === 'bran'), 'dead'));
  });

  test('«Рискнуть всем»: больше на Надежде — снять хиты по кости Надежды', () => {
    const out = exchange({
      system, compendium, die: tape(4, 1), sheets: [sheetOf('bran', { hp: 6 }), sheetOf('стол')],
      actionId: 'death_risk:0', fromId: 'bran', toId: 'bran',
    });
    eq(valueOf(out, 'bran', 'hp'), 2);
  });
});
