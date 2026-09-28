import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { rollCheck, fieldCheck } from '../src/engine/check.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun5')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string) => structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
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
