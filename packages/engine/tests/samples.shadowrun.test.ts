import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { rollCheck, fieldCheck } from '../src/engine/check.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}) => {
  const sheet = structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values } } as Sheet;
};
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);

const dice = (...runs: [number, number][]) => {
  const tape = runs.flatMap(([n, value]) => Array(n).fill(value) as number[]);
  return () => tape.shift() ?? 1;
};

const shoot = (from: Sheet, to: Sheet, action: string, die: () => number, дистанция = 'близкая') => exchange({
  system, compendium, die, sheets: [from, to], actionId: action, fromId: from.id, toId: to.id, inputs: { дистанция },
});
const after = (out: ReturnType<typeof exchange>, id: string) => out.sheets.find(s => s.id === id)!;

group('Shadowrun 6: наборы и значения по книге', () => {
  test('навык с листа — набор «навык + характеристика», успехи на 5–6', () => {
    const check = fieldCheck(system, 'firearms_pool');
    const out = rollCheck(system, sheetOf('razor'), check, { compendium, die: dice([4, 6], [7, 2]), owner: check.label });
    eq(out.rolled.rolls.length, 11, 'Стрельба 6 + Проворство 5');
    eq(out.total, 4);
  });

  test('без изучения: Атлетика — характеристика − 1, Взлом — нельзя', () => {
    eq(computed(sheetOf('silk'), 'athletics_pool'), 2);
    eq(computed(sheetOf('silk'), 'cracking_pool'), 0);
  });

  test('значение защиты = Тело + броня; тролль +1 за подкожные наросты; шлем сверху', () => {
    eq(computed(sheetOf('lone_star'), 'defense_rating'), 6, 'как в блоке патрульного, стр. 207');
    eq(computed(sheetOf('fiveeyes'), 'defense_rating'), 3, 'как в блоке мотобанды, стр. 205');
    eq(computed(sheetOf('hammer'), 'defense_rating'), 8 + 3 + 1 + 1);
  });

  test('счётчики: ⌈Тело/2⌉ + 8 и Живучесть орка; перелив оглушения в физический, физического — в критический', () => {
    eq(computed(sheetOf('razor'), 'physical_max'), 12, '8 + 3 + Живучесть 1');
    const hurt = sheetOf('humanis', { stun: 12, physical: 8 });
    eq(computed(hurt, 'stun_overflow'), 3);
    eq(computed(hurt, 'critical'), 2);
    eq(computed(hurt, 'is_dead'), false);
    eq(computed(sheetOf('humanis', { stun: 12, physical: 10 }), 'is_dead'), true, 'Тело 2 × 2 = 4 критических');
  });
});

group('Shadowrun 6: атака', () => {
  test('попадание: чистые успехи к урону, сопротивление Телом, вид урона по оружию', () => {
    const out = shoot(sheetOf('razor'), sheetOf('lone_star'), 'predator_vi:0', dice([11, 6], [6, 1], [3, 1]));
    eq(after(out, 'lone_star').values.physical, 3 + 11);
    ok(wears(after(out, 'lone_star'), 'prone'), 'урон больше Тела — «Распластан»');
  });

  test('ничья — базовый урон', () => {
    const out = shoot(sheetOf('silk'), sheetOf('humanis'), 'colt_l36:0', dice([2, 6], [4, 1], [2, 6], [2, 1], [2, 1]));
    eq(after(out, 'humanis').values.physical, 2);
  });

  test('оглушающая дубинка: оглушающий урон и «Электрошок»', () => {
    const out = shoot(sheetOf('lone_star'), sheetOf('humanis'), 'stun_baton:0', dice([7, 6], [4, 1], [2, 1]), 'вплотную');
    eq(after(out, 'humanis').values.stun, 5 + 7);
    ok(wears(after(out, 'humanis'), 'shocked'));
  });

  test('значение атаки выше защиты на 4 — очко Преимущества атакующему; на дистанции «—» стрелять нельзя', () => {
    const razor = sheetOf('razor', { edge_left: 0 });
    const out = shoot(razor, sheetOf('humanis'), 'predator_vi:0', dice([11, 1], [4, 1]));
    eq(after(out, 'razor').values.edge_left, 1, 'АТК 10 против ЗЩТ 2');
    const far = shoot(sheetOf('razor'), sheetOf('humanis'), 'predator_vi:0', dice(), 'дальняя');
    eq(after(far, 'humanis').values.physical ?? 0, 0);
  });

  test('защита выше атаки на 4 — очко Преимущества защитнику', () => {
    const guard = sheetOf('swat', { edge_left: 0 });
    const out = shoot(sheetOf('fiveeyes'), guard, 'streetline:0', dice([4, 1], [8, 1]));
    eq(after(out, 'swat').values.edge_left, 1, 'АТК 8 против ЗЩТ 14');
  });
});
