import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { rollCheck, fieldCheck } from '../src/engine/check.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun5')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}) => {
  const sheet = structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values } } as Sheet;
};
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);

const dice = (...runs: [number, number][]) => {
  const tape = runs.flatMap(([n, value]) => Array(n).fill(value) as number[]);
  return () => tape.shift() ?? 1;
};

const shoot = (from: string, to: string, action: string, die: () => number) => exchange({
  system, compendium, die, sheets: [sheetOf(from), sheetOf(to)], actionId: action, fromId: from, toId: to,
});

group('Shadowrun: пул к6, успехи на 5–6', () => {
  test('навык с листа — пул из навыка и атрибута, считаются успехи', () => {
    const check = fieldCheck(system, 'pistols_pool');
    const out = rollCheck(system, sheetOf('razor'), check, { compendium, die: dice([4, 6], [8, 2]), owner: check.label });
    eq(out.rolled.rolls.length, 12, 'Пистолеты 6 + Ловкость 6');
    eq(out.total, 4);
  });

  test('без навыка — атрибут минус один', () => {
    const check = fieldCheck(system, 'hacking_pool');
    eq(rollCheck(system, sheetOf('razor'), check, { compendium, die: dice(), owner: check.label }).rolled.rolls.length, 1);
  });
});

group('Shadowrun: выстрел', () => {
  test('защиту и сопротивление бросает цель своими пулами', () => {
    const out = shoot('razor', 'guard', 'ares_predator_v:0', dice([12, 6], [8, 1], [15, 1]));
    const trace = JSON.stringify(out.reports);
    ok(trace.includes('"rolls":[1,1,1,1,1,1,1,1]'), 'защита цели: Реакция 4 + Интуиция 4 = 8 костей');
    ok(trace.includes(`"rolls":[${Array(15).fill(1).join(',')}]`), 'сопротивление: Тело 4 + Броня 12 − пробитие 1 = 15 костей');
  });

  test('успехов засчитывается не больше точности; чистые успехи в урон; физический трек заполнен — «При смерти»', () => {
    const out = shoot('razor', 'guard', 'ares_predator_v:0', dice([12, 6], [8, 1], [15, 1]));
    const guard = out.sheets.find(s => s.id === 'guard')!;
    eq(guard.values.physical, 13, 'урон 8 + 5 чистых успехов (точность 5), сопротивление без успехов');
    ok(wears(guard, 'bleeding'));
  });

  test('урон не пробил броню — становится оглушающим', () => {
    const out = shoot('silk', 'guard', 'colt_america_l36:0', dice([3, 6], [3, 1], [8, 1], [16, 1]));
    const guard = out.sheets.find(s => s.id === 'guard')!;
    eq(guard.values.physical ?? 0, 0);
    eq(guard.values.stun, 10, 'урон 7 + 3 успеха = 10, броня 12 — оглушающий');
    ok(wears(guard, 'unconscious'), 'оглушающий трек 10 из 10');
  });

  test('защита набрала столько же — промах', () => {
    const out = shoot('silk', 'guard', 'colt_america_l36:0', dice([2, 6], [4, 1], [2, 5], [6, 1]));
    const guard = out.sheets.find(s => s.id === 'guard')!;
    eq(guard.values.physical ?? 0, 0);
    eq(guard.values.stun ?? 0, 0);
  });
});

group('Shadowrun: сверено с книгой', () => {
  const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));

  test('без навыка по умолчанию нельзя — пул 0; можно — атрибут минус один', () => {
    const razor = sheetOf('razor');
    eq(computed(razor, 'locksmith_pool'), 0, 'взлом замков без навыка не бросают');
    eq(computed(razor, 'hacking_pool'), 1);
  });

  test('тролль: кожная броня +1, шлем прибавляется, но не больше Силы', () => {
    eq(computed(sheetOf('hammer'), 'armor'), 9 + 2 + 1);
  });

  test('оглушающий сверх трека переливается в физический по две клетки за одну; штраф за раны по обоим трекам', () => {
    const hurt = sheetOf('razor', { stun: 14, physical: 3 });
    eq(computed(hurt, 'stun_overflow'), 2, 'трек 10, лишних 4');
    eq(computed(hurt, 'physical_total'), 5);
    eq(computed(hurt, 'wound_mod'), -4, '5 физических → −1, 10 оглушающих → −3');
  });

  test('урон, равный броне, остаётся физическим', () => {
    const out = shoot('silk', 'ganger', 'colt_america_l36:0', dice([2, 6], [4, 1], [6, 1], [13, 1]));
    const ganger = out.sheets.find(s => s.id === 'ganger')!;
    eq(ganger.values.physical, 9, 'урон 7 + 2 успеха = 9 при броне 9');
    eq(ganger.values.stun ?? 0, 0);
  });
});
