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
    const check = fieldCheck(system, 'skills.firearms.pool');
    const out = rollCheck(system, sheetOf('razor'), check, { compendium, die: dice([4, 6], [7, 2]), owner: check.label });
    eq(out.rolled.rolls.length, 11, 'Стрельба 6 + Проворство 5');
    eq(out.total, 4);
  });

  test('без изучения: Атлетика — характеристика − 1, Взлом — нельзя', () => {
    eq(computed(sheetOf('silk'), 'skills.athletics.pool'), 2);
    eq(computed(sheetOf('silk'), 'skills.cracking.pool'), 0);
  });

  test('значение защиты = Тело + броня; тролль +1 за подкожные наросты; шлем сверху', () => {
    eq(computed(sheetOf('lone_star'), 'stats.defense_rating.value'), 6, 'как в блоке патрульного, стр. 207');
    eq(computed(sheetOf('fiveeyes'), 'stats.defense_rating.value'), 3, 'как в блоке мотобанды, стр. 205');
    eq(computed(sheetOf('hammer'), 'stats.defense_rating.value'), 8 + 3 + 1 + 1);
  });

  test('счётчики: ⌈Тело/2⌉ + 8 и Живучесть орка; перелив оглушения в физический, физического — в критический', () => {
    eq(computed(sheetOf('razor'), 'stats.physical_max.value'), 12, '8 + 3 + Живучесть 1');
    const hurt = sheetOf('humanis', { stun: 12, physical: 8 });
    eq(computed(hurt, 'stats.stun_overflow.value'), 3);
    eq(computed(hurt, 'stats.critical.value'), 2);
    eq(computed(hurt, 'stats.is_dead.value'), false);
    eq(computed(sheetOf('humanis', { stun: 12, physical: 10 }), 'stats.is_dead.value'), true, 'Тело 2 × 2 = 4 критических');
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

group('Shadowrun 6: Преимущество и действия', () => {
  const desk = (battle: number) => ({ id: 'стол', systemId: 'shadowrun6', name: 'Стол', values: { battle }, has: [], effects: [] }) as unknown as Sheet;
  const hit = (from: Sheet, to: Sheet, action: string, die: () => number, inputs: Record<string, unknown>, battle = 0) => exchange({
    system, compendium, die, sheets: [from, to, desk(battle)], actionId: action, fromId: from.id, toId: to.id,
    inputs: { дистанция: 'близкая', ...inputs } as never,
  });

  test('не больше 2 очков Преимущества за раунд', () => {
    const razor = sheetOf('razor', { edge_left: 0, edge_gained: 2 });
    const out = hit(razor, sheetOf('humanis'), 'predator_vi:0', dice([11, 1], [4, 1]), {});
    eq(after(out, 'razor').values.edge_left, 0);
  });

  test('«Вырубить ударом» за 2 очка: урон больше Воли — счётчик оглушения полон', () => {
    const out = hit(sheetOf('lone_star', { edge_left: 2 }), sheetOf('humanis'), 'stun_baton:0', dice([7, 6], [4, 1], [2, 1]),
      { дистанция: 'вплотную', приём: 'Вырубить ударом' });
    eq(after(out, 'lone_star').values.edge_left, 1, 'заплатил 2, получил 1 за АТК 6 против ЗЩТ 2');
    eq(after(out, 'humanis').values.stun, 9);
    ok(wears(after(out, 'humanis'), 'unconscious'));
  });

  test('в бою атака тратит сложное действие; второго нет', () => {
    const first = hit(sheetOf('razor', { complex_left: 1 }), sheetOf('humanis'), 'predator_vi:0', dice(), {}, 1);
    eq(after(first, 'razor').values.complex_left, 0);
    let refused = '';
    try { hit(sheetOf('razor', { complex_left: 0 }), sheetOf('humanis'), 'predator_vi:0', dice(), {}, 1); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('сложное действие'), refused);
  });
});

group('Shadowrun 6: отряд пешек', () => {
  test('счётчик урона и Преимущество у отряда общие: урон по одному виден у другого', () => {
    const sheets = [sheetOf('razor'), sheetOf('fiveeyes'), sheetOf('fiveeyes_2'), sheetOf('fiveeyes_squad')];
    const out = exchange({
      system, compendium, die: dice([11, 6], [6, 1], [2, 1]), sheets, actionId: 'predator_vi:0', fromId: 'razor', toId: 'fiveeyes',
      inputs: { дистанция: 'близкая' },
    });
    eq(after(out, 'fiveeyes_squad').values.physical, 3 + 11);
    const second = after(out, 'fiveeyes_2');
    eq(calc(system, second, 'physical', newPass(system, second, { compendium, shared: out.sheets.filter(s => s.id === 'fiveeyes_squad') })), 14);
    eq(calc(system, second, 'edge_left', newPass(system, second, { compendium, shared: out.sheets.filter(s => s.id === 'fiveeyes_squad') })), 1, 'общий запас Преимущества = ПР отряда');
  });
});

group('Shadowrun 6: пешка — тип листа переопределяет формулы', () => {
  test('одна шкала на оба вида урона, 8 + ⌈большее из(Воля, Тело)/2⌉, штраф за каждые 2 ячейки', () => {
    const grunt = sheetOf('fiveeyes', { stun: 3, physical: 2 });
    delete (grunt as { group?: string }).group;
    eq(computed(grunt, 'stats.physical_max.value'), 9, 'как СС 9 в блоке «Пятиглазых», стр. 205');
    eq(computed(grunt, 'stats.physical_total.value'), 5);
    eq(computed(grunt, 'stats.wound_mod.value'), -2);
    eq(computed(grunt, 'stats.knocked_out.value'), false);
    eq(computed(sheetOf('razor', { stun: 3, physical: 2 }), 'stats.wound_mod.value'), -1, 'у раннера — по-старому');
  });
});
