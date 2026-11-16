import { group, test, eq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { exchange, fight } from './play.ts';
import { perform } from '../src/core/perform.ts';
import { rollInitiative } from './kit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const book = sr.compendium as Compendium;

const praetor = { id: 'praetor', table: 'firearm', label: 'ФН Р93 Претор', cells: { dv: 4, damage_kind: 'физический', skill: 'стрельба', class: 'пистолет-пулемёт', modes: ['короткая очередь', 'длинная очередь', 'непрерывный огонь'], ammo_max: 50, reload: 'обойма', ar1: 9, ar2: 12, ar3: 7 } };
const compendium = { ...book, records: [...book.records, praetor] } as Compendium;

const fighter = (id: string, values: Record<string, unknown>, has: Sheet['has'] = []): Sheet => ({
  id, systemId: 'shadowrun6', of: 'runner', name: id,
  values: { metatype: 'человек', body: 3, agility: 3, reaction: 3, strength: 3, willpower: 3, logic: 3, intuition: 3, charisma: 3, edge: 3, edge_left: 0, edge_gained: 0, ...values },
  has, effects: [],
}) as unknown as Sheet;
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 2; };
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const shoot = (from: Sheet, to: Sheet[], faces: number[], inputs: Record<string, string> = {}, action = 'predator_vi:0') => exchange({
  system, compendium, die: tape(...faces), sheets: [from, ...to], actionId: action, fromId: from.id, toIds: to.map(t => t.id),
  inputs: { дистанция: 'близкая', ...inputs },
});
const after = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!;
const prone = (sheet: Sheet) => sheet.effects.some(e => e.effectId === 'prone');
const ammo = (sheet: Sheet, of: string) => sheet.has.find(h => h.of === of)?.values?.ammo;

group('Shadowrun 6, глава «Бой»: ситуации книжника (стр. 104–115)', () => {
  test('S3 (стр. 105, 46): ничья 3 на 3 — попадание базовой СУ; ЗА 10 − ЗЩ 6 = 4 — очко стрелку', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 4 }, [{ of: 'predator_vi' }]);
    const target = fighter('цель', { body: 4, armor_worn: 2, reaction: 3, intuition: 3 });
    const out = shoot(shooter, [target], [6, 5, 5, 4, 3, 2, 2, 1, 1, 6, 5, 5, 3, 2, 1, 5, 4, 2, 1]);
    eq(after(out, 'стрелок').values.edge_left, 1);
    eq(after(out, 'цель').values.physical, 2);
    ok(!prone(after(out, 'цель')));
    eq(ammo(after(out, 'стрелок'), 'predator_vi'), 14);
  });

  test('S4 (стр. 109, 111, 39): КО — ЗА 8, очка нет; СУ 3 + 1 + 3 = 7, сопротивление 1 → 6; Распластан; штраф −2; патронов 13', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 4 }, [{ of: 'predator_vi', values: { ammo: 15 } }]);
    const target = fighter('цель', { body: 3, armor_worn: 2, reaction: 3, intuition: 2 });
    const out = shoot(shooter, [target], [6, 6, 5, 5, 4, 3, 2, 1, 1, 5, 3, 2, 2, 1, 6, 4, 1], { режим: 'короткая очередь' });
    eq(after(out, 'стрелок').values.edge_left, 0);
    eq(after(out, 'цель').values.physical, 6);
    ok(prone(after(out, 'цель')));
    eq(at(after(out, 'цель'), 'wound_mod'), -2);
    eq(ammo(after(out, 'стрелок'), 'predator_vi'), 13);
  });

  test('S5 (стр. 109): ДО при 3 патронах — ЗА 10 − 3 = 7, очко стрелку; 2 против 3 — промах; патронов 0', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 3 }, [{ of: 'predator_vi', values: { ammo: 3 } }]);
    const target = fighter('цель', { body: 3, reaction: 3, intuition: 2 });
    const out = shoot(shooter, [target], [5, 5, 4, 3, 3, 2, 1, 1, 6, 5, 5, 1, 1], { режим: 'длинная очередь' });
    eq(after(out, 'стрелок').values.edge_left, 1);
    eq(after(out, 'цель').values.physical ?? 0, 0);
    eq(ammo(after(out, 'стрелок'), 'predator_vi'), 0);
  });

  test('S5а (стр. 109): КО при одном патроне — нельзя (правило нехватки — только у ДО)', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 3 }, [{ of: 'predator_vi', values: { ammo: 1 } }]);
    let refused = '';
    try { shoot(shooter, [fighter('цель', {})], [], { режим: 'короткая очередь' }); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('не хватает патронов'), refused);
  });

  test('S5б (стр. 109): одиночный выстрел — у любого оружия дальнего боя', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 3 }, [{ of: 'praetor', values: { ammo: 50 } }]);
    const out = shoot(shooter, [fighter('цель', {})], [], { режим: 'одиночный выстрел' }, 'praetor:0');
    eq(ammo(after(out, 'стрелок'), 'praetor'), 49);
  });

  test('S7 (стр. 108, 46, 39): средняя — ЗА 8; ЗЩ 12 — очко защитнику; ранение −1 в защите; сопротивление без штрафа гасит всё', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 5 }, [{ of: 'predator_vi' }]);
    const target = fighter('цель', { body: 6, armor_worn: 6, reaction: 4, intuition: 5, physical: 3 });
    const out = shoot(shooter, [target], [6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 5, 5, 4, 3, 2, 2, 1, 1, 6, 6, 5, 5, 2, 1], { дистанция: 'средняя' });
    const trace = out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]);
    eq(trace.find(t => t.step === 'защита')?.rolls?.length, 8);
    eq(trace.find(t => t.step === 'сопротивление_бросок')?.rolls?.length, 6);
    eq(after(out, 'цель').values.edge_left, 1);
    eq(after(out, 'цель').values.physical, 3);
  });

  test('S8 (стр. 109, 46): НО по двум целям — ЗА 12 − 6 = 6; против наивысшей ЗЩ 4 очка нет; урон по каждой своей защитой; патронов 40', () => {
    const shooter = fighter('стрелок', { agility: 6, 'skills.стрельба.rank': 4 }, [{ of: 'praetor', values: { ammo: 50 } }]);
    const a = fighter('А', { body: 2, reaction: 2, intuition: 2 });
    const b = fighter('Б', { body: 4, reaction: 3, intuition: 3 });
    const out = shoot(shooter, [a, b], [6, 5, 5, 5, 4, 3, 3, 2, 2, 1, 5, 3, 2, 1, 4, 2, 6, 5, 5, 5, 2, 1, 5, 3, 2, 1], { режим: 'непрерывный огонь' }, 'praetor:0');
    eq(after(out, 'стрелок').values.edge_left, 0);
    eq(after(out, 'А').values.physical, 7);
    ok(prone(after(out, 'А')));
    eq(after(out, 'Б').values.physical, 3);
    ok(!prone(after(out, 'Б')));
    eq(ammo(after(out, 'стрелок'), 'praetor'), 40);
  });

  test('S9 (стр. 45): у стрелка 3 единицы из 6 — не сбой; у защитника 4 из 6 — сбой', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 1 }, [{ of: 'predator_vi' }]);
    const target = fighter('цель', { body: 5, armor_worn: 3, reaction: 2, intuition: 4 });
    const out = shoot(shooter, [target], [5, 4, 3, 1, 1, 1, 6, 3, 1, 1, 1, 1, 5, 4, 3, 2, 1]);
    ok(!out.log.some(l => l.startsWith('стрелок применяет «Сбой»')), out.log.join('\n'));
    ok(out.log.some(l => l.startsWith('цель применяет «Сбой»')), out.log.join('\n'));
    eq(after(out, 'цель').values.physical, 2);
  });

  test('S10 (стр. 45): атака без успехов с 4 единицами из 7 — критический сбой', () => {
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 2 }, [{ of: 'predator_vi' }]);
    const target = fighter('цель', { body: 3, armor_worn: 4, reaction: 2, intuition: 2 });
    const out = shoot(shooter, [target], [4, 3, 2, 1, 1, 1, 1, 4, 3, 2, 2, 2, 2, 2]);
    ok(out.log.some(l => l.startsWith('стрелок применяет «Критический сбой»')), out.log.join('\n'));
  });
});

group('Shadowrun 6, глава «Урон, броня, ранения»: ситуации книжника (стр. 39, 105–111, 121)', () => {
  const hurt = (target: Sheet, amount: number, physical = 1) => {
    const tag = physical ? 'physical' : 'stun';
    const out = perform({ system, compendium, clock: null, sheets: [target], die: tape() }, { op: 'set', sheetId: target.id, tag, value: Number(target.values[tag] ?? 0) + amount });
    if (out.kind !== 'done') throw new Error(out.kind);
    return out;
  };

  test('DMG-03 (стр. 105–106): сопротивление — только Тело, броня в набор не входит', () => {
    const shooter = fighter('стрелок', { agility: 3, 'skills.стрельба.rank': 3 }, [{ of: 'predator_vi' }]);
    const target = fighter('цель', { body: 4, armor_worn: 2 });
    const out = shoot(shooter, [target], [5, 5, 5, 2, 2, 2, 5, 5, 5, 2, 2, 2, 6, 2, 2, 1]);
    const trace = out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]);
    eq(trace.find(t => t.step === 'сопротивление_бросок')?.rolls?.length, 4);
    eq(after(out, 'цель').values.physical, 2);
  });

  test('DMG-06 (стр. 39): штраф ранений — по полным рядам обоих счётчиков; к сопротивлению не применяется', () => {
    const one = fighter('р', { body: 4, willpower: 3, agility: 5, 'skills.стрельба.rank': 4, physical: 3, stun: 8 });
    eq(at(one, 'wound_mod'), -3);
    eq(at(one, 'skills.стрельба.pool'), 6);
    eq(at(fighter('р', { body: 4, willpower: 3, physical: 3, stun: 9 }), 'wound_mod'), -4);
  });

  test('DMG-07 (стр. 39): лишнее оглушение уходит в физический, счётчик оглушения полон — без сознания', () => {
    const target = fighter('цель', { body: 5, willpower: 4, stun: 8 });
    const out = hurt(target, 5, 0);
    const t = after(out, 'цель');
    eq(at(t, 'stun_overflow'), 3);
    eq(at(t, 'physical_total'), 3);
    eq(at(t, 'knocked_out'), true);
    ok(t.effects.some(e => e.effectId === 'unconscious'), t.effects.map(e => e.effectId).join(','));
  });

  test('DMG-08 (стр. 39, 121): лишний физический — критический; Тело × 2 критических — смерть', () => {
    const near = fighter('цель', { body: 3, physical: 8 });
    const dead = after(hurt(near, 8), 'цель');
    eq(at(dead, 'critical'), 6);
    eq(at(dead, 'is_dead'), true);
    const alive = after(hurt(near, 7), 'цель');
    eq(at(alive, 'critical'), 5);
    eq(at(alive, 'is_dead'), false);
  });
});

group('Shadowrun 6, глава «Инициатива и действия»: ситуации книжника (стр. 40–44, 106–108)', () => {
  const start = (sheets: Sheet[], faces: number[]) => rollInitiative(system, sheets, compendium, tape(...faces));

  test('INI-01 (стр. 107): сумма кубиков; ничья 10 на 10 — у кого больше Преимущество', () => {
    const carson = fighter('Карсон', { reaction: 5, intuition: 5, init_dice: 2 });
    const oda = fighter('Ода', { reaction: 6, intuition: 3, edge: 5 });
    const thug = fighter('бандит', { reaction: 2, intuition: 2, edge: 3 });
    const out = start([thug, oda, carson], [6, 1, 4, 5]);
    eq(out.rolls.find(r => r.sheetId === 'Карсон')!.total, 19);
    eq(out.rolls.find(r => r.sheetId === 'Ода')!.total, 10);
    eq(out.rolls.find(r => r.sheetId === 'бандит')!.total, 10);
    eq(out.order.join(' → '), 'Карсон → Ода → бандит');
  });

  test('INI-02 (стр. 107): Преимущество равно — решает Реакция', () => {
    const a = fighter('А', { reaction: 5, intuition: 2, edge: 3 });
    const b = fighter('Б', { reaction: 4, intuition: 3, edge: 3 });
    eq(start([b, a], [3, 3]).order.join(' → '), 'А → Б');
  });

  test('INI-03, INI-04 (стр. 40, 106–107): три кубика — сумма граней; кубиков не больше 5; простых действий не больше 5', () => {
    eq(start([fighter('р', { reaction: 4, intuition: 3, init_dice: 3 })], [1, 2, 6]).rolls[0]!.total, 16);
    const fast = fighter('р', { reaction: 5, intuition: 4, init_dice: 5 });
    eq(start([fast], [6, 6, 6, 6, 6, 6]).rolls[0]!.total, 39);
    const turn = perform({ system, compendium, clock: null, sheets: [fast], die: tape(6, 6, 6, 6, 6) }, { op: 'turn', turn: 'start', order: ['р'] } as never);
    if (turn.kind !== 'done') throw new Error(turn.kind);
    eq(after(turn, 'р').values.simple_left, 5);
    eq(at(after(turn, 'р'), 'complex_left'), 1);
  });

  test('со стола (стр. 45, 47): на броске инициативы сбоя нет; Преимущество предлагает переброс и +3 к инициативе, но не успехи', async () => {
    const { perform: run } = await import('../src/core/perform.ts');
    const one = fighter('р', { reaction: 3, intuition: 3, edge_left: 2 });
    const first = run({ system, compendium, clock: null, sheets: [one], die: tape(1) }, { op: 'turn', turn: 'start' } as never);
    if (first.kind !== 'paused') throw new Error(first.kind);
    const offers = first.question.offers.map(o => o.id);
    ok(offers.includes('edge_init') && offers.includes('edge_reroll_one'), offers.join(','));
    ok(!offers.includes('edge_plus_hit') && !offers.includes('edge_bump'), offers.join(','));
    const second = run({ system, compendium, clock: null, sheets: [one], die: tape(1), journal: { ...first.journal, answers: { ...first.journal.answers, [first.question.key]: ['edge_init'] } } }, { op: 'turn', turn: 'start' } as never);
    if (second.kind !== 'done') throw new Error(second.kind);
    ok(second.log.some(l => l.includes('Инициатива: р 10')), second.log.join('\n'));
    ok(!second.log.some(l => l.includes('«Сбой»')), second.log.join('\n'));
    eq(after(second, 'р').values.edge_left, 1);
  });
});

group('Shadowrun 6: действия защиты (стр. 42–43)', () => {
  const desk = { id: 'стол', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
  const prepare = (who: Sheet, pick: string, battle = false) => {
    const out = exchange({ system, compendium, die: tape(), sheets: [who, desk], ...(battle ? { clock: fight(who.id) } : {}), actionId: '+defense_action', fromId: who.id, toIds: [], inputs: { действие: pick } });
    return after(out, who.id);
  };
  const defenseDice = (attacker: Sheet, weapon: string, target: Sheet) => {
    const out = exchange({ system, compendium, die: tape(), sheets: [attacker, target], actionId: weapon, fromId: attacker.id, toIds: [target.id], ...(weapon.startsWith('sap') ? {} : { inputs: { дистанция: 'вплотную' } }) });
    const trace = out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]);
    return { dice: trace.find(t => t.step === 'защита')?.rolls?.length, target: after(out, target.id) };
  };
  const whitney = () => fighter('Уитни', { reaction: 4, intuition: 3, 'skills.ближний_бой.rank': 5, 'skills.атлетика.rank': 2, willpower: 3 });
  const thug = fighter('бандит', { agility: 3, 'skills.ближний_бой.rank': 3, 'skills.стрельба.rank': 3 }, [{ of: 'sap' }, { of: 'colt_l36' }]);

  test('INI-06 (стр. 42): Блокировать — Реакция 4 + Интуиция 3 + Ближний бой 5 = 12 кубиков на одну защиту в рукопашной; потом снова 7', () => {
    const ready = prepare(whitney(), 'Блокировать');
    const first = defenseDice(thug, 'sap:0', ready);
    eq(first.dice, 12);
    eq(defenseDice(thug, 'sap:0', first.target).dice, 7);
  });

  test('Блокировать не помогает против стрельбы (стр. 42)', () => {
    eq(defenseDice(thug, 'colt_l36:0', prepare(whitney(), 'Блокировать')).dice, 7);
  });

  test('Уклониться — Атлетика к одной защите, в бою тратит простое действие (стр. 43)', () => {
    const ready = prepare({ ...whitney(), values: { ...whitney().values, simple_left: 2 } } as Sheet, 'Уклониться', true);
    eq(ready.values.simple_left, 1);
    eq(defenseDice(thug, 'colt_l36:0', ready).dice, 9);
  });

  test('Глухая оборона — Воля ко всем защитам раунда, тратит сложное действие (стр. 43)', () => {
    const ready = prepare({ ...whitney(), values: { ...whitney().values, complex_left: 1 } } as Sheet, 'Глухая оборона', true);
    eq(at(ready, 'complex_left'), 0);
    const first = defenseDice(thug, 'sap:0', ready);
    eq(first.dice, 10);
    eq(defenseDice(thug, 'colt_l36:0', first.target).dice, 10);
  });
});

group('Shadowrun 6: чувство заявляют и к броскам действия (стр. 53)', () => {
  test('ослеплённый стрелок: «зрение», заявленное к «Выстрелить», снимает 3 кубика с атаки', () => {
    const shooter = { ...fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 4 }, [{ of: 'predator_vi' }]), effects: [{ effectId: 'blinded' }] } as Sheet;
    const target = fighter('цель', { body: 4, reaction: 3, intuition: 3 });
    const attack = (claims?: { source: string[] }) => {
      const out = exchange({ system, compendium, die: tape(), sheets: [shooter, target], actionId: 'predator_vi:0', fromId: shooter.id, toIds: [target.id], inputs: { дистанция: 'близкая' }, ...(claims ? { claims } : {}) });
      return (/Бросок \(атака\): \[([^\]]*)\]/.exec(out.log.join(' · '))?.[1] ?? '').split(',').filter(Boolean).length;
    };
    eq(attack({ source: ['зрение'] }), attack() - 3);
  });

  test('«зрение» не трогает сопротивления: у мага колдовство −3, истощение прежнее; у цели защита −3, сопротивление урону прежнее', () => {
    const pool = (out: ReturnType<typeof exchange>, part: string) =>
      ([...out.log.join(' · ').matchAll(/Бросок \(([^)]*)\): \[([^\]]*)\]/g)].find(m => m[1]!.includes(part))?.[2] ?? '').split(',').filter(Boolean).length;
    const mage = { ...fighter('маг', { magic: 5, willpower: 4, logic: 4, 'skills.колдовство.rank': 4 }, [{ of: 'spell_mana_bolt' }]), effects: [{ effectId: 'blinded' }] } as Sheet;
    const victim = fighter('цель', { body: 4, willpower: 3 });
    const cast = (claims?: { source: string[] }) => exchange({ system, compendium, die: tape(), sheets: [mage, victim], actionId: 'spell_mana_bolt:0', fromId: mage.id, toIds: [victim.id], ...(claims ? { claims } : {}) });
    const [plain, seen] = [cast(), cast({ source: ['зрение'] })];
    eq(pool(seen, 'колдовство'), pool(plain, 'колдовство') - 3);
    eq(pool(seen, 'истощению'), pool(plain, 'истощению'));
    const shooter = fighter('стрелок', { agility: 5, 'skills.стрельба.rank': 4 }, [{ of: 'predator_vi' }]);
    const blind = { ...fighter('цель', { body: 4, reaction: 3, intuition: 3 }), effects: [{ effectId: 'blinded' }] } as Sheet;
    const shot = (claims?: { target: string[] }) => exchange({ system, compendium, die: tape(), sheets: [shooter, blind], actionId: 'predator_vi:0', fromId: shooter.id, toIds: [blind.id], inputs: { дистанция: 'близкая' }, ...(claims ? { claims } : {}) });
    const [open, dark] = [shot(), shot({ target: ['зрение'] })];
    eq(pool(dark, 'защита'), pool(open, 'защита') - 3);
    eq(pool(dark, 'физический'), pool(open, 'физический'));
  });
});
