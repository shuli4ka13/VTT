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
    let refused = '';
    try { shoot(sheetOf('razor'), sheetOf('humanis'), 'predator_vi:0', dice(), 'дальняя'); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('на этой дистанции оружие не бьёт'), 'действие не состоялось, ничего не потрачено');
  });

});

group('Shadowrun 6: Преимущество и действия', () => {
  const desk = (battle: boolean) => ({ id: 'стол', systemId: 'shadowrun6', name: 'Стол', values: { battle }, has: [], effects: [] }) as unknown as Sheet;
  const hit = (from: Sheet, to: Sheet, action: string, die: () => number, inputs: Record<string, unknown>, battle = false) => exchange({
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
    const first = hit(sheetOf('razor', { complex_left: 1 }), sheetOf('humanis'), 'predator_vi:0', dice(), {}, true);
    eq(after(first, 'razor').values.complex_left, 0);
    let refused = '';
    try { hit(sheetOf('razor', { complex_left: 0 }), sheetOf('humanis'), 'predator_vi:0', dice(), {}, true); } catch (err) { refused = (err as Error).message; }
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

group('Shadowrun 6: оружие, патроны, модификации, взрывы (компендиум, этап 2)', () => {
  const step = (out: ReturnType<typeof exchange>, id: string) =>
    out.reports.flatMap(entry => (entry.report.trace ?? []) as { step: unknown; total?: number }[]).find(one => one.step === id)?.total;
  const item = (sheet: Sheet, of: string) => sheet.has.find(entry => entry.of === of);
  const equip = (id: string, values: Record<string, unknown>, ...extra: Sheet['has']): Sheet => {
    const sheet = sheetOf(id, values);
    return { ...sheet, has: [...sheet.has, ...extra] } as Sheet;
  };
  const kit: Record<string, () => Sheet> = {
    silk: () => equip('silk', {}, { of: 'laser_sight', in: 'colt_l36' }),
    razor: () => equip('razor', { smartlink: 1 }, { of: 'ammo_apds', in: 'predator_vi' }),
  };
  const fire = (from: string, to: string, action: string, inputs: Record<string, unknown>, die = () => 1) => exchange({
    system, compendium, die, sheets: [kit[from]?.() ?? sheetOf(from), sheetOf(to)], actionId: action, fromId: from, toId: to, inputs: inputs as never,
  });
  const refusal = (run: () => unknown) => { try { run(); return ''; } catch (err) { return (err as Error).message; } };

  test('короткая очередь тратит 2 патрона и даёт СУ +1; газоотвод гасит штраф −2', () => {
    const out = fire('hammer', 'humanis', 'ak_97:0', { дистанция: 'близкая', режим: 'короткая очередь' });
    eq(item(after(out, 'hammer'), 'ak_97')?.values?.ammo, 36, 'боезапас 38 − 2');
    eq(step(out, 'атк'), 11, 'АК-97 на близкой 11, штраф КО погашен газоотводом');
    eq(step(out, 'ур'), 6, 'СУ 5 + 1 за очередь');
  });

  test('режим — только из разрешённых; с короткой очередью можно одиночный', () => {
    ok(refusal(() => fire('silk', 'humanis', 'colt_l36:0', { дистанция: 'близкая', режим: 'длинная очередь' })).includes('нет такого режима'));
    const single = fire('silk', 'humanis', 'colt_l36:0', { дистанция: 'близкая', режим: 'одиночный выстрел' });
    eq(item(after(single, 'silk'), 'colt_l36')?.values?.ammo, 10, 'боезапас 11 − 1');
  });

  test('лазерный прицел +1; ПБОП: ЗА +2, СУ −1; смартган со смартлинком +2, с лазером не складывается', () => {
    eq(step(fire('silk', 'humanis', 'colt_l36:0', { дистанция: 'близкая', режим: 'одиночный выстрел' }), 'атк'), 9, 'Кольт 8 + лазер 1');
    const razor = fire('razor', 'humanis', 'predator_vi:0', { дистанция: 'близкая', режим: 'короткая очередь' });
    eq(step(razor, 'атк'), 10 - 2 + 2 + 2, 'Предатор 10, КО −2, встроенный смартган +2, ПБОП +2');
    eq(step(razor, 'ур'), 3 + 1 - 1);
  });

  test('патронов нет — действие не состоялось; «Перезарядить» — до боезапаса', () => {
    const empty = kit.silk!();
    item(empty, 'colt_l36')!.values = { ammo: 0 };
    ok(refusal(() => exchange({ system, compendium, die: () => 1, sheets: [empty, sheetOf('humanis')], actionId: 'colt_l36:0', fromId: 'silk', toId: 'humanis', inputs: { дистанция: 'близкая', режим: 'одиночный выстрел' } as never })).includes('патронов нет'));
    const reloaded = exchange({ system, compendium, die: () => 1, sheets: [empty], actionId: 'colt_l36:1', fromId: 'silk', toIds: [] });
    eq(item(after(reloaded, 'silk'), 'colt_l36')?.values?.ammo, 11);
  });

  test('граната: у каждой цели своё кольцо, урон по кольцу, сопротивление Телом; гранат на одну меньше', () => {
    const out = exchange({
      system, compendium, die: () => 1, sheets: [sheetOf('razor'), sheetOf('humanis'), sheetOf('mafia')],
      actionId: 'grenade_frag:0', fromId: 'razor', toIds: ['humanis', 'mafia'],
      inputs: { дистанция: 'близкая', кольцо: { humanis: 'эпицентр', mafia: 'близко' } } as never,
    });
    const frag = compendium.records.find(r => r.id === 'grenade_frag')!.cells as Record<string, number>;
    eq(after(out, 'humanis').values.physical, frag.dv_e);
    eq(after(out, 'mafia').values.physical, frag.dv_n);
    eq(item(after(out, 'razor'), 'grenade_frag')?.values?.count, 1);
  });

  test('взрывпакет: эпицентр — рейтинг, вплотную — рейтинг/2, близко — рейтинг/4', () => {
    const sapper = { ...sheetOf('razor'), has: [{ of: 'explosive_pack', values: { rating: 9, count: 1 } }] } as Sheet;
    const out = exchange({
      system, compendium, die: () => 1, sheets: [sapper, sheetOf('humanis'), sheetOf('mafia'), sheetOf('silk')],
      actionId: 'explosive_pack:0', fromId: 'razor', toIds: ['humanis', 'mafia', 'silk'],
      inputs: { кольцо: { humanis: 'эпицентр', mafia: 'вплотную', silk: 'близко' } } as never,
    });
    eq(after(out, 'humanis').values.physical, 9);
    eq(after(out, 'mafia').values.physical, 4);
    eq(after(out, 'silk').values.physical, 2);
  });
});

group('Shadowrun 6: общие функции этапа 3 — Урон и Преимущество', () => {
  test('запрет тратить Преимущество (Ошеломление и т. п.) — трата отказывает, даже когда очков хватает', () => {
    const silk = sheetOf('silk', { edge_left: 5, edge_no_spend: 1 });
    let refused = '';
    try { exchange({ system, compendium, die: () => 1, sheets: [silk], actionId: 'act_second_wind:0', fromId: 'silk', toId: 'silk' }); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('тратить Преимущество сейчас нельзя'), refused);
  });

  test('урон идёт через функцию «Урон» и отдаёт итог: «Распластан» по полученному', () => {
    const out = shoot(sheetOf('silk'), sheetOf('humanis'), 'colt_l36:0', dice([6, 6], [4, 1], [2, 1], [2, 1]));
    ok(out.log.some(line => line.includes('зовёт «Урон»')));
  });
});
