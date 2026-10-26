import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const book = sr.compendium as Compendium;
const like = (id: string, label: string, from: string, cells: Record<string, unknown>) => {
  const base = book.records.find(r => r.id === from)!;
  const { bindings: _kept, ...rest } = base as typeof base & { bindings?: unknown };
  return { ...rest, id, label, cells: { ...base.cells, ...cells } };
};
const compendium = { ...book, records: [...book.records,
  like('spell_ice_spear', 'Ледяное копьё', 'spell_fireball', { drain: 5, area: false, element: 'холод' }),
  like('spell_stunbolt', 'Оглушающий разряд', 'spell_mana_bolt', { drain: 3, damage: 'оглушающий' }),
  like('spell_manaball', 'Шар маны', 'spell_mana_bolt', { drain: 5, area: true }),
] } as Compendium;

const sheet = (id: string, values: Record<string, unknown>, has: Sheet['has'] = []): Sheet => ({
  id, systemId: 'shadowrun6', of: 'runner', name: id,
  values: { metatype: 'человек', body: 3, agility: 3, reaction: 3, strength: 3, willpower: 3, logic: 3, intuition: 3, charisma: 3, edge: 3, edge_left: 0, edge_gained: 0, ...values },
  has, effects: [],
}) as unknown as Sheet;
const SPELLS = ['spell_fireball', 'spell_mana_bolt', 'spell_stunbolt', 'spell_ice_spear', 'spell_manaball'];
const caster = (values: Record<string, unknown>) => sheet('маг', { awakened: 'маг', ...values }, SPELLS.map(of => ({ of })));
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 2; };
const cast = (from: Sheet, to: Sheet[], spell: string, faces: number[], inputs: Record<string, number> = {}) => exchange({
  system, compendium, die: tape(...faces), sheets: [from, ...to], actionId: `${spell}:0`, fromId: from.id, toIds: to.map(s => s.id),
  inputs: { amp: 0, widen: 0, ...inputs },
});
const after = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!;
const at = (s: Sheet, tag: string) => calc(system, s, tag, newPass(system, s, { compendium }));
const level = (s: Sheet, effect: string) => s.effects.find(e => e.effectId === effect)?.args;

group('Shadowrun 6, глава «Магия»: ситуации книжника (стр. 127–148)', () => {
  test('mag-01 (стр. 132): Огненный шар Кэсса по трём охранникам, радиус +2 м — СИ 7; ЗА 11 против наивысшей ЗЩ 8 — очка нет; 3ф и Горение 2 каждому; истощение 3о', () => {
    const kass = caster({ tradition: 'шаманизм', magic: 6, charisma: 5, willpower: 5, 'skills.колдовство.rank': 5, edge_left: 2 });
    const guards = [sheet('о1', { body: 3, armor_worn: 5 }), sheet('о2', { body: 3, armor_worn: 3 }), sheet('о3', { body: 3, armor_worn: 3 })];
    const guardDice = [6, 5, 5, 2, 2, 2, 6, 5, 2];
    const out = cast(kass, guards, 'spell_fireball', [6, 6, 5, 5, 5, 4, 3, 3, 2, 2, 1, 6, 5, 5, 5, 4, 3, 3, 2, 2, 1, ...guardDice, ...guardDice, ...guardDice], { widen: 1 });
    for (const g of ['о1', 'о2', 'о3']) {
      eq(after(out, g).values.physical, 3, g);
      eq(level(after(out, g), 'burning')?.level, 2, g);
    }
    eq(after(out, 'маг').values.stun, 3);
    eq(after(out, 'маг').values.edge_left, 2, 'очко за ЗА — против наивысшей ЗЩ, 11 − 8 = 3');
  });

  test('mag-02 (стр. 133): Разряд маны с насыщением 1 — 2 чистых + 1 = 3ф без сопротивления; истощение СИ 6 − 3 = 3о', () => {
    const mage = caster({ tradition: 'герметизм', magic: 5, logic: 4, willpower: 5, 'skills.колдовство.rank': 4 });
    const target = sheet('цель', { willpower: 3, intuition: 3, body: 4, armor_worn: 2 });
    const out = cast(mage, [target], 'spell_mana_bolt', [6, 6, 5, 5, 3, 2, 2, 1, 1, 6, 5, 5, 4, 3, 3, 2, 1, 1, 6, 5, 3, 2, 1, 1], { amp: 1 });
    eq(after(out, 'цель').values.physical, 3);
    eq(after(out, 'маг').values.stun, 3);
    eq(after(out, 'маг').values.edge_left, 0);
  });

  test('mag-04 (стр. 46, 133): Ледяное копьё — ЗА 10 − ЗЩ 6 = 4: очко магу; ⌈5/2⌉ + 1 − 2 = 2ф; Заморозка на 1 раунд', () => {
    const mage = caster({ tradition: 'герметизм', magic: 5, logic: 5, willpower: 4, 'skills.колдовство.rank': 4, edge_left: 2 });
    const target = sheet('цель', { reaction: 4, willpower: 3, body: 5, armor_worn: 1 });
    const out = cast(mage, [target], 'spell_ice_spear', [6, 5, 5, 4, 3, 3, 2, 1, 1, 6, 6, 5, 4, 3, 2, 2, 1, 1, 6, 5, 4, 3, 2, 2, 1, 6, 5, 3, 2, 1]);
    eq(after(out, 'маг').values.edge_left, 3);
    eq(after(out, 'цель').values.physical, 2);
    eq(level(after(out, 'цель'), 'chilled')?.level, 1);
    eq(after(out, 'маг').values.stun, 2);
  });

  test('mag-05 (стр. 131): истощение ровно в Магию — оглушающее, на 1 больше — физическое', () => {
    const mage = caster({ tradition: 'герметизм', magic: 3, logic: 3, willpower: 3, 'skills.колдовство.rank': 4 });
    const target = sheet('цель', {});
    const a = cast(mage, [target], 'spell_mana_bolt', [2, 2, 2, 2, 2, 2, 2, 6, 5, 5, 4, 2, 1], { amp: 1 });
    eq(after(a, 'маг').values.stun, 3);
    eq(after(a, 'маг').values.physical ?? 0, 0);
    const b = cast(mage, [target], 'spell_mana_bolt', [2, 2, 2, 2, 2, 2, 2, 6, 5, 4, 3, 2, 1], { amp: 1 });
    eq(after(b, 'маг').values.physical, 4);
  });

  test('mag-06 (стр. 39, 131): истощение 5о при 8 из 10 на оглушении — счётчик полон, 3 в физический', () => {
    const mage = caster({ tradition: 'герметизм', magic: 6, logic: 5, willpower: 4, 'skills.колдовство.rank': 5, stun: 8 });
    const out = cast(mage, [sheet('цель', {})], 'spell_fireball', [...Array(11).fill(2), 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    const m = after(out, 'маг');
    eq(at(m, 'stun_overflow'), 3);
    eq(at(m, 'knocked_out'), true);
  });

  test('mag-07 (стр. 132): два поддерживаемых заклинания — −4 кубика к сотворению, истощение без штрафа', () => {
    const held = (inst: string) => ({ effectId: 'sustaining', inst, args: { заклинание: 'sp_armor' } });
    const mage = { ...caster({ tradition: 'шаманизм', magic: 5, charisma: 5, willpower: 4, 'skills.колдовство.rank': 5 }), effects: [held('а'), held('б')] };
    const out = cast(mage, [sheet('цель', { willpower: 2, intuition: 2 })], 'spell_stunbolt', [6, 5, 4, 3, 2, 1]);
    const trace = out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]);
    eq(trace.find(t => t.step === 'сотворение')?.rolls?.length, 6);
    eq(trace.find(t => t.step === 'выдержка')?.rolls?.length, 9, 'поддержание штрафует действия, не сопротивление истощению');
  });

  test('mag-08 (стр. 46, 133): Шар маны по двум целям ЗЩ 7 и 5 — ЗА 10 против наивысшей 7: очка нет; радиус +4 м — СИ 7', () => {
    const mage = caster({ tradition: 'герметизм', magic: 6, logic: 4, willpower: 4, 'skills.колдовство.rank': 5 });
    const out = cast(mage, [sheet('а', { body: 3, armor_worn: 4 }), sheet('б', { body: 3, armor_worn: 2 })], 'spell_manaball', [...Array(11).fill(2), 6, 6, 5, 5, 4, 3, 2, 1], { widen: 2 });
    eq(after(out, 'маг').values.edge_left, 0);
    eq(after(out, 'маг').values.stun, 3);
  });

  test('mag-09 (стр. 146): призыв — 3 успеха против 3 у духа: духа нет; истощение = успехи духа − 1 = 2о', () => {
    const summoner = sheet('маг', { awakened: 'маг', tradition: 'шаманизм', magic: 4, charisma: 4, willpower: 4, 'skills.воплощение.rank': 4 }, [{ of: 'mg_summon' }]);
    const spirit = { id: 'дух', systemId: 'shadowrun6', of: 'spirit', name: 'Дух', values: {}, has: [], effects: [] } as unknown as Sheet;
    const out = exchange({ system, compendium, die: tape(6, 5, 5, 3, 2, 2, 1, 1, 6, 6, 5, 3, 2, 1, 5, 4, 3, 3, 2, 2, 1, 1), sheets: [summoner, spirit], actionId: 'mg_summon:0', fromId: 'маг', toIds: ['дух'], inputs: { kind: 'воздуха', force: 3 } });
    eq(after(out, 'дух').values.services ?? 0, 0);
    eq(after(out, 'маг').values.spirits_force ?? 0, 0);
    eq(after(out, 'маг').values.stun, 2);
  });

  test('лист «Кошка (уличный шаман)» — как блок архетипа на стр. 89: инициатива 5, счётчики 10/11, ЗЩ 6, ЗА заклинаний 11', () => {
    const koshka = structuredClone(sr.sheets.find(one => one.id === 'koshka')!) as Sheet;
    eq(at(koshka, 'initiative'), 5);
    eq(at(koshka, 'physical_max'), 10);
    eq(at(koshka, 'stun_max'), 11);
    eq(at(koshka, 'defense_rating'), 6);
    eq(at(koshka, 'spell_ar'), 11);
    eq(at(koshka, 'drain_pool'), 10);
  });

  test('со стола (стр. 111): косвенное заклинание — урон больше Тела сбивает с ног; ровно Тело — нет', () => {
    const kass = caster({ tradition: 'шаманизм', magic: 6, charisma: 5, willpower: 5, 'skills.колдовство.rank': 6 });
    const hit = (resist: number[]) => cast(kass, [sheet('о', { body: 3 })], 'spell_fireball', [...Array(6).fill(5), ...Array(6).fill(2), ...Array(10).fill(2), 2, 2, 2, 2, 2, 2, ...resist]);
    const hard = after(hit([2, 2, 2]), 'о');
    eq(hard.values.physical, 9);
    ok(hard.effects.some(e => e.effectId === 'prone'));
  });
});

