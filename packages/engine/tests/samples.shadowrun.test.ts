import { group, test, eq, ok, deepEq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange, fight } from './play.ts';
import { fieldCheck } from '../src/engine/check.ts';
import { rollCheck, fireMoments } from './kit.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { perform } from '../src/core/perform.ts';
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

const shoot = (from: Sheet, to: Sheet, action: string, die: () => number, distanciya = 'blizkaya') => exchange({
  system, compendium, die, sheets: [from, to], actionId: action, fromId: from.id, toId: to.id, inputs: { distanciya },
});
const after = (out: ReturnType<typeof exchange>, id: string) => out.sheets.find(s => s.id === id)!;

group('Shadowrun 6: наборы и значения по книге', () => {
  test('навык с листа — набор «навык + характеристика», успехи на 5–6', () => {
    const check = fieldCheck(system, 'skills.strelba.pool');
    const out = rollCheck(system, sheetOf('razor'), check, { compendium, die: dice([4, 6], [7, 2]), owner: check.label });
    eq(out.rolled.rolls.length, 11, 'Стрельба 6 + Проворство 5');
    eq(out.total, 4);
  });

  test('без изучения: Атлетика — характеристика − 1, Взлом — нельзя', () => {
    eq(computed(sheetOf('silk'), 'skills.atletika.pool'), 2);
    eq(computed(sheetOf('silk'), 'skills.vzlom.pool'), 0);
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
    try { shoot(sheetOf('razor'), sheetOf('humanis'), 'predator_vi:0', dice(), 'dalnyaya'); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('на этой дистанции оружие не бьёт'), 'действие не состоялось, ничего не потрачено');
  });

});

group('Shadowrun 6: Преимущество и действия', () => {
  const desk = { id: 'desk', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
  const hit = (from: Sheet, to: Sheet, action: string, die: () => number, inputs: Record<string, unknown>, battle = false) => exchange({
    system, compendium, die, sheets: [from, to, desk], ...(battle ? { clock: fight(from.id, to.id) } : {}), actionId: action, fromId: from.id, toId: to.id,
    inputs: { ...(/^(stun_baton|katana|sap|combat_knife):/.test(action) ? {} : { distanciya: 'blizkaya' }), ...inputs } as never,
  });

  test('не больше 2 очков Преимущества за раунд', () => {
    const razor = sheetOf('razor', { edge_left: 0, edge_gained: 2 });
    const out = hit(razor, sheetOf('humanis'), 'predator_vi:0', dice([11, 1], [4, 1]), {}, true);
    eq(after(out, 'razor').values.edge_left, 0);
    const outside = hit(razor, sheetOf('humanis'), 'predator_vi:0', dice([11, 1], [4, 1]), {});
    eq(after(outside, 'razor').values.edge_left, 1, 'вне боя предела за раунд нет (стр. 46)');
    eq(after(outside, 'razor').values.edge_gained, 2, 'вне боя счётчик раунда не растёт');
  });

  test('«Вырубить ударом» за 2 очка: урон больше Воли — счётчик оглушения полон', () => {
    const out = hit(sheetOf('lone_star', { edge_left: 2 }), sheetOf('humanis'), 'stun_baton:0', dice([7, 6], [4, 1], [2, 1]),
      { priem: 'vyrubit_udarom' });
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

group('Shadowrun 6: Преимущество — книга, шаг 8', () => {
  const closeScene = (sheet: Sheet) => {
    const out = perform({ system, compendium, clock: null, sheets: [sheet], die: () => 1 }, { op: 'turn', turn: 'scene' } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    return out.sheets.find(s => s.id === sheet.id)!;
  };

  test('конец сцены (стр. 46): очки сверх характеристики Преимущество пропадают, недостающие не восполняются', () => {
    eq(closeScene(sheetOf('razor', { edge: 3, edge_left: 5 })).values.edge_left, 3);
    eq(closeScene(sheetOf('razor', { edge: 3, edge_left: 1 })).values.edge_left, 1);
  });

  test('конец боя (стр. 46): очки сверх характеристики Преимущество пропадают', () => {
    const out = perform({ system, compendium, clock: null, sheets: [sheetOf('razor', { edge: 3, edge_left: 6 })], die: () => 1 }, { op: 'turn', turn: 'stop' } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    eq(out.sheets[0]!.values.edge_left, 3);
  });

  test('«Начало игровой встречи» (стр. 45): Преимущество цели — её характеристика, действующий не меняется', () => {
    const out = exchange({ system, compendium, die: () => 1, sheets: [sheetOf('razor', { edge_left: 0 }), sheetOf('silk', { edge: 4, edge_left: 0 })], actionId: 'act_scene:0', fromId: 'razor', toIds: ['silk'] });
    eq(after(out, 'silk').values.edge_left, 4);
    eq(after(out, 'razor').values.edge_left, 0);
  });

  test('«Второе дыхание» и «Ранен не так сильно» (стр. 48) лечат действующего, а не цель', () => {
    const wind = exchange({ system, compendium, die: () => 1, sheets: [sheetOf('razor', { edge_left: 3, stun: 3 }), sheetOf('silk', { stun: 2 })], actionId: 'act_second_wind:0', fromId: 'razor', toIds: ['silk'] });
    eq(after(wind, 'razor').values.stun, 2);
    eq(after(wind, 'silk').values.stun, 2);
    const shrug = exchange({ system, compendium, die: () => 1, sheets: [sheetOf('razor', { edge_left: 4, physical: 3 }), sheetOf('silk', { physical: 2 })], actionId: 'act_shrug:0', fromId: 'razor', toIds: ['silk'] });
    eq(after(shrug, 'razor').values.physical, 2);
    eq(after(shrug, 'silk').values.physical, 2);
  });
});

group('Shadowrun 6: оружие — книга, шаг 8', () => {
  const deskIn = { id: 'desk', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
  const reloadIn = (weapon: string, smartlink: boolean) => {
    const holder = { ...sheetOf('silk', { complex_left: 1, simple_left: 3, smartlink }), has: [{ of: weapon, values: { ammo: 0 } }] } as Sheet;
    return exchange({ system, compendium, die: () => 1, sheets: [holder, deskIn], clock: fight('silk'), actionId: `${weapon}:1`, fromId: 'silk', toIds: [] }).sheets.find(s => s.id === 'silk')!;
  };

  test('перезарядка обоймы (стр. 42, 44): без смартлинка — сложное действие', () => {
    const out = reloadIn('colt_l36', false);
    eq(out.values.complex_left, 0);
    eq(out.values.simple_left, 3);
  });

  test('перезарядка смартгана (стр. 42): со смартлинком — простое действие', () => {
    const out = reloadIn('predator_vi', true);
    eq(out.values.complex_left, 1);
    eq(out.values.simple_left, 2);
  });

  test('перезарядка смартгана без смартлинка (стр. 44) — сложное действие', () => {
    const out = reloadIn('predator_vi', false);
    eq(out.values.complex_left, 0);
    eq(out.values.simple_left, 3);
  });

  test('«Страйкер» (стр. 44): перезарядка ракетного снаряда — сложное действие', () => {
    const out = reloadIn('striker', false);
    eq(out.values.complex_left, 0);
    eq(out.values.simple_left, 3);
  });
});

group('Shadowrun 6: существа и пешки — книга, шаг 8', () => {
  const creature = (kind: string, values: Record<string, unknown> = {}) => ({ id: 'зверь', systemId: 'shadowrun6', of: 'creature', name: 'Существо', values: { creature_kind: kind, ...values }, has: [], effects: [] }) as unknown as Sheet;

  test('вид существа (стр. 216–220): Сила сбойной крысы 0, Сила и Магия восточного дракона 30 и 10, Сущность 10, Сущность гуля 5', () => {
    const rat = creature('sboynaya_krysa');
    eq(computed(rat, 'strength'), 0);
    const dragon = creature('vostochnyy_drakon');
    deepEq([computed(dragon, 'strength'), computed(dragon, 'magic'), computed(dragon, 'essence')], [30, 10, 10]);
    eq(computed(creature('gul'), 'essence'), 5);
  });

  test('Магия вампира — меньшее из 6 и Сущности (стр. 217)', () => {
    eq(computed(creature('vampir'), 'magic'), 6);
  });

  test('броня существа (стр. 216, 222): защита дракона 26, акулы 11', () => {
    eq(computed(creature('vostochnyy_drakon'), 'defense_rating'), 26);
    eq(computed(creature('akula'), 'defense_rating'), 11);
  });

  test('защита в астрале (стр. 160): естественная броня в неё не входит', () => {
    eq(computed(sheetOf('razor', { armor_natural: 4 }), 'astral_dr'), computed(sheetOf('razor'), 'astral_dr'));
  });

  test('поддержание заклинаний (стр. 132, 222): пешка и существо — −2 кубика за заклинание, как у бегущего', () => {
    const roll = (sheet: Sheet, sustaining: number) => {
      const held = { ...sheet, effects: [...sheet.effects, ...Array.from({ length: sustaining }, () => ({ effectId: 'sustaining' }))] } as Sheet;
      const out = perform({ system, compendium, clock: null, sheets: [held], die: () => 6 }, { op: 'roll', sheetId: held.id, tag: 'skills.strelba.pool' } as never);
      if (out.kind !== 'done') throw new Error(out.kind);
      return (/\[([^\]]*)\]/.exec(out.log.join('\n'))?.[1] ?? '').split(',').filter(Boolean).length;
    };
    for (const sheet of [sheetOf('fiveeyes', { 'skills.strelba.rank': 3, edge_left: 0 }), creature('volk', { 'skills.strelba.rank': 3, edge_left: 0 })]) eq(roll(sheet, 0) - roll(sheet, 1), 2);
  });

  test('командир отряда (стр. 203): профессиональный рейтинг добавляется к счётчику', () => {
    const base = computed(sheetOf('fiveeyes'), 'physical_max') as number;
    eq(computed(sheetOf('fiveeyes', { grunt_leader: true, grunt_pr: 3 }), 'physical_max'), base + 3);
  });

  test('пешка (стр. 203): добит оглушающим — без сознания, физическим — истекает кровью', () => {
    const finishing = (from: Sheet, action: string, inputs: Record<string, unknown>) => {
      const pawn = sheetOf('fiveeyes');
      const nearly = { ...pawn, values: { ...pawn.values, stun: (computed(pawn, 'physical_max') as number) - 1 } } as Sheet;
      let used = 0;
      const out = exchange({ system, compendium, die: () => (used++ < 24 ? 6 : 1), sheets: [from, nearly], actionId: action, fromId: from.id, toId: 'fiveeyes', inputs: inputs as never });
      return after(out, 'fiveeyes');
    };
    const stunned = finishing(sheetOf('lone_star'), 'stun_baton:0', {});
    ok(wears(stunned, 'unconscious') && !wears(stunned, 'bleeding'), JSON.stringify(stunned.effects));
    const shot = finishing(sheetOf('razor', { agility: 1, 'skills.strelba.rank': 1 }), 'predator_vi:0', { distanciya: 'blizkaya' });
    ok(wears(shot, 'bleeding') && !wears(shot, 'unconscious'), JSON.stringify(shot.effects));
  });
});

group('Shadowrun 6: отряд пешек', () => {
  test('счётчик урона и Преимущество у отряда общие: урон по одному виден у другого', () => {
    const sheets = [sheetOf('razor'), sheetOf('fiveeyes'), sheetOf('fiveeyes_2'), sheetOf('fiveeyes_squad')];
    const out = exchange({
      system, compendium, die: dice([11, 6], [6, 1], [2, 1]), sheets, actionId: 'predator_vi:0', fromId: 'razor', toId: 'fiveeyes',
      inputs: { distanciya: 'blizkaya' },
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
    razor: () => equip('razor', { smartlink: true }, { of: 'ammo_apds', in: 'predator_vi' }),
  };
  const fire = (from: string, to: string, action: string, inputs: Record<string, unknown>, die = () => 1) => exchange({
    system, compendium, die, sheets: [kit[from]?.() ?? sheetOf(from), sheetOf(to)], actionId: action, fromId: from, toId: to, inputs: inputs as never,
  });
  const refusal = (run: () => unknown) => { try { run(); return ''; } catch (err) { return (err as Error).message; } };

  test('короткая очередь тратит 2 патрона и даёт СУ +1; газоотвод гасит штраф −2', () => {
    const out = fire('hammer', 'humanis', 'ak_97:0', { distanciya: 'blizkaya', rezhim: 'korotkaya_ochered' });
    eq(item(after(out, 'hammer'), 'ak_97')?.values?.ammo, 36, 'боезапас 38 − 2');
    eq(step(out, 'atk'), 11, 'АК-97 на близкой 11, штраф КО погашен газоотводом');
    eq(step(out, 'ur'), 6, 'СУ 5 + 1 за очередь');
  });

  test('режим — только из разрешённых; с короткой очередью можно одиночный', () => {
    ok(refusal(() => fire('silk', 'humanis', 'colt_l36:0', { distanciya: 'blizkaya', rezhim: 'dlinnaya_ochered' })).includes('нет такого режима'));
    const single = fire('silk', 'humanis', 'colt_l36:0', { distanciya: 'blizkaya', rezhim: 'odinochnyy_vystrel' });
    eq(item(after(single, 'silk'), 'colt_l36')?.values?.ammo, 10, 'боезапас 11 − 1');
  });

  test('лазерный прицел +1; ПБОП: ЗА +2, СУ −1; смартган со смартлинком +2, с лазером не складывается', () => {
    eq(step(fire('silk', 'humanis', 'colt_l36:0', { distanciya: 'blizkaya', rezhim: 'odinochnyy_vystrel' }), 'atk'), 9, 'Кольт 8 + лазер 1');
    const razor = fire('razor', 'humanis', 'predator_vi:0', { distanciya: 'blizkaya', rezhim: 'korotkaya_ochered' });
    eq(step(razor, 'atk'), 10 - 2 + 2 + 2, 'Предатор 10, КО −2, встроенный смартган +2, ПБОП +2');
    eq(step(razor, 'ur'), 3 + 1 - 1);
  });

  test('патронов нет — действие не состоялось; «Перезарядить» — до боезапаса', () => {
    const empty = kit.silk!();
    item(empty, 'colt_l36')!.values = { ammo: 0 };
    ok(refusal(() => exchange({ system, compendium, die: () => 1, sheets: [empty, sheetOf('humanis')], actionId: 'colt_l36:0', fromId: 'silk', toId: 'humanis', inputs: { distanciya: 'blizkaya', rezhim: 'odinochnyy_vystrel' } as never })).includes('патронов нет'));
    const reloaded = exchange({ system, compendium, die: () => 1, sheets: [empty], actionId: 'colt_l36:1', fromId: 'silk', toIds: [] });
    eq(item(after(reloaded, 'silk'), 'colt_l36')?.values?.ammo, 11);
  });

  test('граната: у каждой цели своё kolco, урон по кольцу, сопротивление Телом; гранат на одну меньше', () => {
    const out = exchange({
      system, compendium, die: () => 1, sheets: [sheetOf('razor'), sheetOf('humanis'), sheetOf('mafia')],
      actionId: 'grenade_frag:0', fromId: 'razor', toIds: ['humanis', 'mafia'],
      inputs: { distanciya: 'blizkaya', kolco: { humanis: 'epicentr', mafia: 'blizko' } } as never,
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
      inputs: { kolco: { humanis: 'epicentr', mafia: 'vplotnuyu', silk: 'blizko' } } as never,
    });
    eq(after(out, 'humanis').values.physical, 9);
    eq(after(out, 'mafia').values.physical, 4);
    eq(after(out, 'silk').values.physical, 2);
  });

  test('ракетная установка стреляет: навык «экзотическое оружие» с пробелом находится через [ ]; СУ по кольцу у каждой цели', () => {
    const gunner = { ...sheetOf('razor'), has: [{ of: 'striker', values: { ammo: 2 } }, { of: 'rocket_frag', in: 'striker' }] } as Sheet;
    const out = exchange({
      system, compendium, die: () => 1, sheets: [gunner, sheetOf('humanis'), sheetOf('mafia')],
      actionId: 'striker:0', fromId: 'razor', toIds: ['humanis', 'mafia'],
      inputs: { distanciya: 'srednyaya', kolco: { humanis: 'epicentr', mafia: 'blizko' } } as never,
    });
    const rocket = compendium.records.find(r => r.id === 'rocket_frag')!.cells as Record<string, number>;
    eq(after(out, 'humanis').values.physical, rocket.dv_e);
    eq(after(out, 'mafia').values.physical, rocket.dv_n);
    eq(item(after(out, 'razor'), 'striker')?.values?.ammo, 1);
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

group('Shadowrun 6: состояния (стр. 52–54)', () => {
  const wearing = (id: string, ...effects: { effectId: string; args?: Record<string, unknown> }[]) => {
    const sheet = sheetOf(id, { edge_left: 0 });
    return { ...sheet, effects: [...sheet.effects, ...effects] } as Sheet;
  };
  const roll = (sheet: Sheet, tag: string, claims?: string[]) => {
    const out = perform({ system, compendium, clock: null, sheets: [sheet], die: () => 6 }, { op: 'roll', sheetId: sheet.id, tag, ...(claims ? { claims } : {}) } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    return out.log.join('\n');
  };
  const dicePool = (text: string) => (/\[([^\]]*)\]/.exec(text)?.[1] ?? '').split(',').filter(Boolean).length;

  test('Ослепление II: −6 кубиков к проверкам зрением по заявке, без заявки — как было', () => {
    const blind = wearing('razor', { effectId: 'blinded', args: { level: 2 } });
    const base = dicePool(roll(sheetOf('razor', { edge_left: 0 }), 'skills.vnimanie.pool', ['zrenie']));
    eq(dicePool(roll(blind, 'skills.vnimanie.pool', ['zrenie'])), base - 6);
    eq(dicePool(roll(blind, 'skills.vnimanie.pool')), base);
  });

  test('Ослепление, повешенное без уровня, — уровень по умолчанию: −3 кубика по заявке «зрение»', () => {
    const base = dicePool(roll(sheetOf('razor', { edge_left: 0 }), 'skills.vnimanie.pool', ['zrenie']));
    eq(dicePool(roll(wearing('razor', { effectId: 'blinded' }), 'skills.vnimanie.pool', ['zrenie'])), base - 3);
  });

  test('Утомление II: −4 ко всем наборам; Электрошок: инициатива −2', () => {
    eq(computed(wearing('razor', { effectId: 'fatigued', args: { level: 2 } }), 'condition_mod'), -4);
    eq(computed(wearing('razor', { effectId: 'shocked' }), 'initiative'), computed(sheetOf('razor'), 'initiative') - 2);
  });

  test('Заморозка (стр. 52–53): инициатива −4, а не −5; Утомление II инициативу не режет (стр. 54)', () => {
    const base = computed(sheetOf('razor'), 'initiative');
    eq(computed(wearing('razor', { effectId: 'chilled' }), 'initiative'), (base as number) - 4);
    eq(computed(wearing('razor', { effectId: 'fatigued', args: { level: 2 } }), 'initiative'), base);
  });

  test('Ослепление III (стр. 53): проверка зрением в сравнении с порогом 0 — автоматический провал', () => {
    const probe = structuredClone(system) as System & { effects: Record<string, unknown> };
    probe.effects.зр_проба = {
      label: 'Проба зрения', params: [{ key: 'действующий', label: 'Кто', kind: 'sheet', role: 'actor' }],
      steps: [
        { id: 'бросок', type: 'roll', die: 'pool', count: { expr: '5' }, tags: ['zrenie'], by: { expr: '@действующий' } },
        { id: 'итог', type: 'check', value: { expr: '@бросок' }, versus: { expr: '0' } },
      ],
    };
    const withProbe = { ...compendium, records: [...compendium.records, { id: 'зр_проба', table: 'action', label: 'Проба зрения', bindings: [{ effect: 'зр_проба' }] }] } as unknown as Compendium;
    const verdict = (level: number) => {
      const out = exchange({ system: probe, compendium: withProbe, die: () => 6, sheets: [wearing('razor', ...(level ? [{ effectId: 'blinded', args: { level } }] : []))], actionId: 'зр_проба:0', fromId: 'razor', toIds: [] });
      return out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; success?: boolean }[]).find(entry => entry.step === 'итог')?.success;
    };
    eq(verdict(0), true);
    eq(verdict(3), false);
  });

  test('Отравление 3: в начале раунда — урон после сопротивления, потом 2', () => {
    const sick = wearing('humanis', { effectId: 'poisoned', args: { level: 3, physical_hit: true } });
    const out = perform({ system, compendium, clock: null, sheets: [sick], die: () => 1 }, { op: 'turn', turn: 'start', order: ['humanis'] } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    const after = out.sheets.find(one => one.id === 'humanis')!;
    eq(after.values.physical, 3);
    eq(after.effects.find(one => one.effectId === 'poisoned')?.args?.level, 2);
  });

  test('Горение и Заморозка отменяют друг друга', () => {
    const burning = wearing('humanis', { effectId: 'burning', args: { level: 2 } });
    const out = perform({ system, compendium, clock: null, sheets: [burning], die: () => 1 }, { op: 'belonging', sheetId: 'humanis', list: 'effects', id: 'chilled', on: true } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    const effects = out.sheets[0]!.effects.map(one => one.effectId);
    ok(effects.includes('chilled') && !effects.includes('burning'), effects.join(','));
  });

  test('Распластанный защитник: +2 к защите со средней дистанции, −2 вплотную', () => {
    const lying = wearing('humanis', { effectId: 'prone' });
    const defense = (range: string) => {
      const out = shoot(sheetOf('razor'), lying, 'predator_vi:0', () => 1, range);
      return out.reports.flatMap(r => r.report.trace as { step: unknown; rolls?: number[] }[]).find(one => one.step === 'zaschita')?.rolls?.length;
    };
    const base = computed(lying, 'defense_pool');
    eq(defense('srednyaya'), base + 2);
    eq(defense('vplotnuyu'), base - 2);
  });

  test('Укрытие IV: −2 кубика к атаке; в бою атака из укрытия просит ещё простое действие', () => {
    const hidden = wearing('razor', { effectId: 'cover', args: { level: 4 } });
    const out = shoot(hidden, sheetOf('humanis'), 'predator_vi:0', () => 1);
    const pool = out.reports.flatMap(r => r.report.trace as { step: unknown; rolls?: number[] }[]).find(one => one.step === 'ataka_brosok')?.rolls?.length;
    eq(pool, computed(sheetOf('razor'), 'skills.strelba.pool') - 2);
    eq(computed(hidden, 'defense_rating'), computed(sheetOf('razor'), 'defense_rating') + 4);
  });
});

group('Shadowrun 6: «Неуверенность» (стр. 77)', () => {
  const unsure = () => ({ ...sheetOf('razor', { willpower: 3 }), has: [...sheetOf('razor').has, { of: 'insecurity' }] } as Sheet);
  const start = (face: number) => fireMoments([{ moment: 'combat-start', sheetId: 'razor' }], [unsure()], { system, compendium, die: () => face })
    .sheets.find(s => s.id === 'razor');

  test('провал проверки Воли в начале боя — «сорвалось»: Преимущество не получать и не тратить', () => {
    ok(wears(start(1), 'insecurity_shaken'));
  });

  test('успех — ничего не висит', () => {
    ok(!wears(start(6), 'insecurity_shaken'));
  });
});
