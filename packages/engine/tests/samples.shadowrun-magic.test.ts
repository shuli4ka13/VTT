import { group, test, eq, deepEq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}, has: Sheet['has'] = []) => {
  const sheet = structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values }, has: [...sheet.has, ...has] } as Sheet;
};
const byHand = (values: Record<string, unknown> = {}, has: Sheet['has'] = []) =>
  sheetOf('humanis', { npc_template: '', body: 2, agility: 2, reaction: 2, strength: 2, willpower: 2, logic: 2, intuition: 2, charisma: 1, ...values }, has);
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 1; };
const after = (out: ReturnType<typeof exchange>, id: string) => out.sheets.find(s => s.id === id)!;
const sustaining = (sheet: Sheet) => (sheet.effects ?? []).filter(e => e.effectId === 'sustaining').length;
const refusal = (fn: () => unknown) => { try { fn(); return ''; } catch (error) { return (error as Error).message; } };
const six = (n: number) => Array(n).fill(6) as number[];
const one = (n: number) => Array(n).fill(1) as number[];

const SPELLS = ['spell_fireball', 'spell_mana_bolt', 'spell_heal', 'spell_increase_attribute', 'spell_stabilize'].map(of => ({ of }));
const mage = (values: Record<string, unknown> = {}, has: Sheet['has'] = []) => ({
  ...sheetOf('razor', { magic: 6, awakened: 'mag', tradition: 'germetizm', logic: 5, willpower: 4, 'skills.koldovstvo.rank': 6, 'skills.voploschenie.rank': 4, ...values }, [...SPELLS, { of: 'mg_summon' }, ...has]),
  id: 'mage', name: 'Маг' } as Sheet);
const act = (from: Sheet, to: Sheet[], actionId: string, die: () => number, inputs?: Record<string, string | number>) =>
  exchange({ system, compendium, die, sheets: [from, ...to], actionId, fromId: from.id, toIds: to.map(s => s.id), ...(inputs ? { inputs } : {}) });

group('Shadowrun 6: долг этапа 3 механикой', () => {
  test('Стойкость: сила урона 3, при Силе 7+ — 4 (стр. 290)', () => {
    const fist = (strength: number) => act(sheetOf('razor', { strength }, [{ of: 'hardened_fist' }]), [sheetOf('humanis')], 'hardened_fist:0', () => 6);
    ok(fist(4).log.join('\n').includes('зовёт «Урон»: 7'));
    ok(fist(7).log.join('\n').includes('зовёт «Урон»: 8'));
  });

  test('Критический удар: +уровень к силе урона ближнего боя (стр. 157)', () => {
    const hit = (has: Sheet['has']) => act(sheetOf('razor', {}, has), [sheetOf('humanis')], 'katana:0', () => 6).log.join('\n');
    ok(hit([]).includes('зовёт «Урон»: 8'));
    ok(hit([{ of: 'adept_critical_strike', values: { level: 2 } }]).includes('зовёт «Урон»: 10'));
  });

  test('Чувствительная система удваивает цену Сущности (стр. 79)', () => {
    eq(computed(sheetOf('razor', {}, [{ of: 'cyberjack', values: { rating: 1 } }]), 'essence'), 5);
    eq(computed(sheetOf('razor', {}, [{ of: 'cyberjack', values: { rating: 1 } }, { of: 'sensitive_system' }]), 'essence'), 4);
  });

  test('Киберразъём 4: ВМ 7, СЭ 6, в ВР +2 кубика инициативы (стр. 284)', () => {
    const jack = sheetOf('razor', { matrix_mode: 'goryachaya_vr' }, [{ of: 'cyberjack', values: { rating: 4 } }]);
    deepEq([computed(jack, 'm_dp'), computed(jack, 'm_firewall'), computed(jack, 'init_dice')], [7, 6, 5]);
  });

  test('Улучшение навыка: не больше ×1,5 (вверх) и +4 (стр. 157)', () => {
    const skill = (rank: number, level: number) => computed(sheetOf('razor', { 'skills.strelba.rank': rank }, [{ of: 'adept_improved_skill', values: { skill: 'strelba', level } }]), 'skills.strelba.rank');
    deepEq([skill(3, 3), skill(6, 6), skill(1, 3)], [5, 9, 2]);
  });

  test('Выжженный: в Матрице Преимущество не тратить (стр. 76)', () => {
    eq(computed(sheetOf('razor', { matrix_mode: 'dr' }, [{ of: 'burned_out' }]), 'edge_no_spend'), 1);
    eq(computed(sheetOf('razor', {}, [{ of: 'burned_out' }]), 'edge_no_spend'), 0);
  });

  test('Дрожь в руках: трату Преимущества на атаку не предлагают (стр. 77)', () => {
    const offers = (has: Sheet['has']) => exchange({ system, compendium, die: () => 3, sheets: [sheetOf('razor', {}, has), sheetOf('humanis')], actionId: 'katana:0', fromId: 'razor', toIds: ['humanis'],
      answer: () => [] }).questions.length;
    ok(offers([{ of: 'shaky_hands' }]) < offers([]));
  });

  test('Дрожь в руках: при защите от выстрела трату Преимущества предлагают (стр. 76)', () => {
    const offers = (has: Sheet['has']) => exchange({ system, compendium, die: () => 3, sheets: [sheetOf('silk', { edge_left: 0 }), sheetOf('razor', { edge_left: 3 }, has)], actionId: 'colt_l36:0', fromId: 'silk', toId: 'razor',
      inputs: { distanciya: 'blizkaya' } as never, answer: () => [] }).questions.length;
    eq(offers([{ of: 'shaky_hands' }]), offers([]));
    ok(offers([]) > 0);
  });

  test('Дрожь в руках: приём Преимущества при атаке отказывает, очки не списаны (стр. 76)', () => {
    const baton = sheetOf('lone_star', { edge_left: 2 }, [{ of: 'shaky_hands' }]);
    let message = '';
    let sheets: Sheet[] = [];
    try { sheets = exchange({ system, compendium, die: () => 1, sheets: [baton, sheetOf('humanis')], actionId: 'stun_baton:0', fromId: 'lone_star', toId: 'humanis', inputs: { priem: 'vyrubit_udarom' } as never }).sheets; } catch (error) { message = (error as Error).message; }
    ok(message.includes('Дрожь в руках'), message);
    eq(sheets.length, 0);
  });

  test('Кортексная микробомба: 18 физического, сопротивление Телом (стр. 283)', () => {
    const out = act(sheetOf('razor', {}, [{ of: 'cortex_bomb_micro' }]), [], 'cortex_bomb_micro:0', () => 1);
    eq(after(out, 'razor').values.physical, 18);
  });
});

group('Shadowrun 6: заклинания', () => {
  test('герметист: ЗА заклинаний = Магия + Логика, истощение — Воля + Логика', () => {
    deepEq([computed(mage(), 'spell_ar'), computed(mage(), 'drain_pool'), computed(mage(), 'skills.koldovstvo.pool')], [11, 9, 12]);
  });

  test('Огненный шар с насыщением 1: ⌈Магия/2⌉ + чистые + 1, Горение = чистые; СИ 8 > Магии — истощение физическое (стр. 131–133)', () => {
    const out = act(mage(), [sheetOf('humanis')], 'spell_fireball:0', tape(...six(6), ...one(6), ...one(9), ...one(4), ...one(2)), { amp: 1, widen: 0 });
    eq(after(out, 'humanis').values.physical, 10);
    ok(wears(after(out, 'humanis'), 'burning'));
    deepEq([after(out, 'mage').values.physical, after(out, 'mage').values.drain_phys], [8, 8]);
  });

  test('Разряд маны: прямое — чистые успехи без сопротивления (стр. 133)', () => {
    const out = act(mage(), [sheetOf('humanis')], 'spell_mana_bolt:0', tape(...six(5), ...one(7), ...six(9), ...one(4)), { amp: 0 });
    eq(after(out, 'humanis').values.physical, 5);
  });

  test('насыщение больше Магии и Колдовства — отказ; второй цели у одиночного — отказ', () => {
    ok(refusal(() => act(mage(), [sheetOf('humanis')], 'spell_mana_bolt:0', () => 1, { amp: 7 })).includes('усилений'));
    ok(refusal(() => act(mage(), [sheetOf('humanis'), sheetOf('mafia')], 'spell_mana_bolt:0', () => 1, { amp: 0 })).includes('одна цель'));
  });

  test('истощение не лечится: Исцеление не опускает оглушающий ниже ячеек истощения (стр. 127)', () => {
    const hurt = mage({ stun: 4, drain_stun: 3 });
    const out = exchange({ system, compendium, die: tape(...six(6), ...one(6), ...six(9)), sheets: [hurt], actionId: 'spell_heal:0', fromId: 'mage', toIds: ['mage'], inputs: { heal_kind: 'oglushayuschiy' } });
    eq(after(out, 'mage').values.stun, 3);
  });

  test('Исцеление: порог 5 − Сущность, 1 ячейка за чистый успех (стр. 136)', () => {
    const out = act(mage(), [sheetOf('humanis', { physical: 6 })], 'spell_heal:0', tape(...six(3), ...one(9), ...six(9)), { heal_kind: 'fizicheskiy' });
    eq(after(out, 'humanis').values.physical, 6 - 3);
  });

  test('Исцеление мёртвого: урон остаётся (стр. 121)', () => {
    const dead = sheetOf('humanis', { physical: 40 });
    eq(computed(dead, 'is_dead'), true);
    const out = act(mage(), [dead], 'spell_heal:0', tape(...six(3), ...one(9), ...six(9)), { heal_kind: 'fizicheskiy' });
    eq(after(out, 'humanis').values.physical, 40);
  });

  test('«Броня» (стр. 139): все чистые успехи идут в защиту без вопросов, истощение без надбавки', () => {
    const out = act(mage({}, [{ of: 'spell_armor' }]), [sheetOf('humanis')], 'spell_armor:0', tape(...six(6), ...one(6), ...six(9)));
    eq(computed(after(out, 'humanis'), 'armor_extra'), 6);
    ok(out.log.join('\n').includes('зовёт «Истощение»: 4'), 'СИ 4 без надбавки');
  });

  test('«Улучшение характеристики» (стр. 137): Преимущество, Магию и Резонанс выбрать нельзя — отказ, ничего не потрачено', () => {
    for (const attr of ['edge', 'magic', 'resonance']) {
      const why = refusal(() => exchange({ system, compendium, die: () => 6, sheets: [mage()], actionId: 'spell_increase_attribute:0', fromId: 'mage', toIds: ['mage'], inputs: { want: 1, attr } }));
      ok(why.includes('Преимущество'), `${attr}: ${why}`);
    }
  });

  test('призыв духа (стр. 66): адепт не призывает, маг и мистический адепт — да', () => {
    const spirit = { id: 'sp', systemId: sr.sheets[0]!.systemId, of: 'spirit', name: 'Дух', values: {}, has: [], effects: [] } as unknown as Sheet;
    const summon = (kind: string) => refusal(() => act(mage({ awakened: kind, tradition: 'shamanizm', charisma: 5, willpower: 5 }), [spirit], 'mg_summon:0', () => 1, { kind: 'vozduha', force: 3 }));
    ok(summon('adept').includes('призывают только'));
    ok(!summon('mag').includes('призывают только'));
    ok(!summon('misticheskiy_adept').includes('призывают только'));
  });

  test('Магия духа = Мощь при 7 и выше (стр. 147–148): предел 6 её не режет', () => {
    const spirit = { id: 'sp', systemId: sr.sheets[0]!.systemId, of: 'spirit', name: 'Дух', values: {}, has: [], effects: [] } as unknown as Sheet;
    let used = 0;
    const out = act(mage({ magic: 7, initiate_grade: 1, tradition: 'shamanizm', charisma: 6, willpower: 6, 'skills.voploschenie.rank': 6 }), [spirit], 'mg_summon:0', () => (used++ < 14 ? 6 : 1), { kind: 'vozduha', force: 7 });
    eq(computed(after(out, 'sp'), 'magic'), 7);
  });

  test('Улучшение характеристики: +применённые, поддержание −2 кубика; «Прекратить» снимает (стр. 137, 131)', () => {
    const out = exchange({ system, compendium, die: tape(...six(6), ...one(6), ...six(9)), sheets: [mage()], actionId: 'spell_increase_attribute:0', fromId: 'mage', toIds: ['mage'], inputs: { want: 3, attr: 'strength' } });
    const boosted = after(out, 'mage');
    deepEq([computed(boosted, 'strength'), sustaining(boosted)], [7, 1]);
    const stopped = exchange({ system, compendium, die: () => 1, sheets: [boosted], actionId: 'spell_increase_attribute:1', fromId: 'mage', toIds: ['mage'] });
    deepEq([computed(after(stopped, 'mage'), 'strength'), sustaining(after(stopped, 'mage'))], [4, 0]);
  });

  test('неудавшееся длительное не поддерживается: штрафа нет (решение владельца)', () => {
    const chromed = byHand({}, [{ of: 'cyberjack', values: { rating: 6 } }, { of: 'cybereyes', values: { rating: 4 } }]);
    ok(computed(chromed, 'essence') <= 4, 'порог 5 − Сущность не ниже 1');
    const out = exchange({ system, compendium, die: () => 1, sheets: [mage(), chromed], actionId: 'spell_increase_attribute:0', fromId: 'mage', toIds: ['humanis'], inputs: { want: 3, attr: 'strength' } });
    eq(wears(after(out, 'humanis'), 'sp_increase_attribute'), false, 'не легло');
    eq(sustaining(after(out, 'mage')), 0);
  });

  test('поддержание — одно на сотворение: два заклинания — два, «Прекратить» отпускает только своё (стр. 131)', () => {
    const ally = byHand({ strength: 4 });
    const first = exchange({ system, compendium, die: tape(...six(6), ...one(6), ...six(9)), sheets: [mage({}, [{ of: 'spell_armor' }]), ally], actionId: 'spell_increase_attribute:0', fromId: 'mage', toIds: ['humanis'], inputs: { want: 3, attr: 'strength' } });
    eq(sustaining(after(first, 'mage')), 1);
    const both = exchange({ system, compendium, die: tape(...six(6), ...one(6), ...six(9)), sheets: first.sheets, actionId: 'spell_armor:0', fromId: 'mage', toIds: ['humanis'] });
    eq(sustaining(after(both, 'mage')), 2);
    const stopped = exchange({ system, compendium, die: () => 1, sheets: both.sheets, actionId: 'spell_increase_attribute:1', fromId: 'mage', toIds: [] });
    eq(sustaining(after(stopped, 'mage')), 1, 'осталось поддержание брони');
    eq(computed(after(stopped, 'humanis'), 'strength'), 4);
    ok(wears(after(stopped, 'humanis'), 'sp_armor'), 'броня держится');
  });
});

group('Shadowrun 6: духи', () => {
  test('призыв духа воздуха Мощи 4: услуги = чистые, характеристики Мощь + смещение, защита (Мо × 2) − 2, инициатива (Мо × 2) + 4 (стр. 147–148)', () => {
    const spirit = { id: 'sp', systemId: sr.sheets[0]!.systemId, of: 'spirit', name: 'Дух', values: {}, has: [], effects: [] } as unknown as Sheet;
    const out = act(mage({ tradition: 'shamanizm', charisma: 5, willpower: 5 }), [spirit], 'mg_summon:0', tape(6, 6, 6, 5, ...one(6), 1, 1, 6, 6, ...one(4), ...six(10)), { kind: 'vozduha', force: 4 });
    const sp = after(out, 'sp');
    deepEq([sp.values.services, computed(sp, 'agility'), computed(sp, 'reaction'), computed(sp, 'defense_rating'), computed(sp, 'initiative'), computed(sp, 'physical_max')], [2, 7, 8, 6, 12, 10]);
    eq(after(out, 'mage').values.spirits_force, 4);
  });

  test('суммарная Мощь духов не больше Магии × 3 (стр. 146)', () => {
    const spirit = { id: 'sp', systemId: sr.sheets[0]!.systemId, of: 'spirit', name: 'Дух', values: {}, has: [], effects: [] } as unknown as Sheet;
    ok(refusal(() => act(mage({ spirits_force: 16 }), [spirit], 'mg_summon:0', () => 1, { kind: 'vozduha', force: 4 })).includes('Магии × 3'));
  });
});

group('Shadowrun 6: навыки духа одной правкой по колонке', () => {
  test('дух воздуха Мощи 4 — свои навыки на Мощь, чужие — ноль', () => {
    const spirit = { id: 'дух', of: 'spirit', systemId: system.id, name: 'Дух', values: { spirit_force: 4, spirit_kind: 'vozduha' }, has: [], effects: [] } as unknown as Sheet;
    deepEq([computed(spirit, 'skills.astral.rank'), computed(spirit, 'skills.koldovstvo.rank')], [4, 0]);
  });
});
