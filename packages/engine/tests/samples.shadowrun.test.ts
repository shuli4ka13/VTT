import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { fieldCheck } from '../src/engine/check.ts';
import { rollCheck } from './kit.ts';
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
    const check = fieldCheck(system, 'skills.стрельба.pool');
    const out = rollCheck(system, sheetOf('razor'), check, { compendium, die: dice([4, 6], [7, 2]), owner: check.label });
    eq(out.rolled.rolls.length, 11, 'Стрельба 6 + Проворство 5');
    eq(out.total, 4);
  });

  test('без изучения: Атлетика — характеристика − 1, Взлом — нельзя', () => {
    eq(computed(sheetOf('silk'), 'skills.атлетика.pool'), 2);
    eq(computed(sheetOf('silk'), 'skills.взлом.pool'), 0);
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
  test('ничья — базовый урон', () => {
    const out = shoot(sheetOf('silk'), sheetOf('humanis'), 'colt_l36:0', dice([2, 6], [4, 1], [2, 6], [2, 1], [2, 1]));
    eq(after(out, 'humanis').values.physical, 2);
  });

  test('значение атаки выше защиты на 4 — очко Преимущества атакующему; на дистанции «—» стрелять нельзя', () => {
    const razor = sheetOf('razor', { edge_left: 0 });
    const out = shoot(razor, sheetOf('humanis'), 'predator_vi:0', dice([11, 1], [4, 1]));
    eq(after(out, 'razor').values.edge_left, 1, 'АТК 10 против ЗЩТ 2');
    const far = shoot(sheetOf('razor'), sheetOf('humanis'), 'predator_vi:0', dice(), 'дальняя');
    eq(after(far, 'humanis').values.physical ?? 0, 0);
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
    eq(computed(grunt, 'physical_max'), 9, 'как СС 9 в блоке «Пятиглазых», стр. 205');
    eq(computed(grunt, 'physical_total'), 5);
    eq(computed(grunt, 'wound_mod'), -2);
    eq(computed(grunt, 'knocked_out'), false);
    eq(computed(sheetOf('razor', { stun: 3, physical: 2 }), 'wound_mod'), -1, 'у раннера — по-старому');
  });
});
