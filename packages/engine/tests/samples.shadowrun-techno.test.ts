import { group, test, eq, deepEq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { breaches } from '../src/engine/limits.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const razor = () => structuredClone(sr.sheets.find(s => s.id === 'razor')!) as Sheet;
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 1; };
const six = (n: number) => Array(n).fill(6) as number[];
const one = (n: number) => Array(n).fill(1) as number[];
const after = (out: ReturnType<typeof exchange>, id: string) => out.sheets.find(s => s.id === id)!;
const sustaining = (sheet: Sheet) => (sheet.effects ?? []).filter(e => e.effectId === 'sustaining').length;
const refusal = (fn: () => unknown) => { try { fn(); return ''; } catch (error) { return (error as Error).message; } };
const deckId = compendium.records.find(r => (r.cells as Record<string, unknown> | undefined)?.device_kind === 'кибердека')!.id;

const technomancer = (values: Record<string, unknown> = {}, has: Sheet['has'] = []) => ({
  ...razor(), id: 'tm', name: 'Техномант',
  values: { ...razor().values, awakened: 'техномант', resonance: 4, logic: 5, intuition: 4, charisma: 3, willpower: 4, matrix_mode: 'горячая ВР',
    'skills.взлом.rank': 5, 'skills.электроника.rank': 4, 'skills.многозадачность.rank': 5, ...values },
  has: [{ of: 'cf_res_spike' }, { of: 'cf_infusion' }, { of: 'tm_sprite_compile' }, ...has] } as Sheet);
const decker = () => ({ ...razor(), values: { ...razor().values, matrix_mode: 'холодная ВР' }, has: [{ of: deckId }] } as Sheet);
const blankSprite = () => ({ id: 'sp', systemId: sr.sheets[0]!.systemId, of: 'sprite', name: 'Спрайт', values: {}, has: [{ of: 'spw_trap' }], effects: [] } as unknown as Sheet);
const act = (sheets: Sheet[], actionId: string, to: string[], die: () => number, inputs?: Record<string, string | number>) =>
  exchange({ system, compendium, die, sheets, actionId, fromId: sheets[0]!.id, toIds: to, ...(inputs ? { inputs } : {}) });

group('Shadowrun 6: живой аватар', () => {
  test('Логика 5, Резонанс 4, три очка в ВМ — ВМ 8; инициатива в ВР — Логика + Интуиция (стр. 189)', () => {
    const tm = technomancer({ tm_dp: 3 });
    deepEq([computed(tm, 'dev_rating'), computed(tm, 'm_attack'), computed(tm, 'm_sleaze'), computed(tm, 'm_dp'), computed(tm, 'm_firewall'), computed(tm, 'initiative')], [4, 3, 4, 8, 4, 9]);
  });

  test('надетая дека аватар не перебивает; программа у техноманта — нарушение', () => {
    eq(computed(technomancer({ tm_dp: 3 }, [{ of: deckId }]), 'm_attack'), 3);
    ok(breaches(system, technomancer({}, [{ of: 'prog_toolkit' }]), { compendium }).some(b => b.text.includes('Программ запущено')));
  });
});

group('Shadowrun 6: сложные формы', () => {
  test('Резонансный шип: Взлом + Резонанс против Воли + СЭ, чистые — урон Матрицы без сопротивления (стр. 191)', () => {
    const out = act([technomancer(), decker()], 'cf_res_spike:0', ['razor'], tape(...six(6), ...one(3), ...six(8), ...one(10)));
    eq(after(out, 'razor').values.matrix_damage, 6);
  });

  test('Инфузия: порог 4, + успехи сверх порога, не больше базового значения; поддержание (стр. 190)', () => {
    const out = act([technomancer()], 'cf_infusion:0', ['tm'], tape(...six(8), 1, ...six(9)), { attr: 'ВМ' });
    deepEq([computed(after(out, 'tm'), 'm_dp'), sustaining(after(out, 'tm'))], [9, 1]);
  });

  test('не техномант — отказ', () => {
    ok(refusal(() => act([{ ...decker(), has: [{ of: 'cf_res_spike' }] } as Sheet, technomancer()], 'cf_res_spike:0', ['tm'], () => 1)).includes('только техномант'));
  });
});

group('Shadowrun 6: спрайты', () => {
  test('крушитель уровня 4: П 7 / У 4 / ВМ 5 / СЭ 6, инициатива (У × 2) + 1 + 4к6, задачи = чистые (стр. 191–193)', () => {
    const out = act([technomancer(), blankSprite()], 'tm_sprite_compile:0', ['sp'], tape(...six(5), ...one(5), 6, ...one(7), ...six(8)), { kind: 'крушитель', level: 4 });
    const sp = after(out, 'sp');
    deepEq([computed(sp, 'm_attack'), computed(sp, 'm_sleaze'), computed(sp, 'm_dp'), computed(sp, 'm_firewall'), computed(sp, 'initiative'), computed(sp, 'init_dice'), computed(sp, 'matrix_cm'), sp.values.tasks],
      [7, 4, 5, 6, 9, 4, 10, 4]);
    eq(after(out, 'tm').values.sprites_unreg, 1);
    ok(refusal(() => act([after(out, 'tm'), blankSprite()], 'tm_sprite_compile:0', ['sp'], () => 1, { kind: 'крушитель', level: 4 })).includes('незарегистрированный'));
  });

  test('Ловушка тратит задачу и лишает цель действий (стр. 194)', () => {
    const compiled = after(act([technomancer(), blankSprite()], 'tm_sprite_compile:0', ['sp'], tape(...six(5), ...one(5), 6, ...one(7), ...six(8)), { kind: 'крушитель', level: 4 }), 'sp');
    const out = act([compiled, decker()], 'spw_trap:0', ['razor'], tape(...six(8), ...one(10)));
    eq(after(out, 'sp').values.tasks, 3);
    ok(wears(after(out, 'razor'), 'sprite_trap'));
  });

  test('Резонанс спрайта = Уровень при 7 и выше (стр. 193): предел 6 его не режет', () => {
    let used = 0;
    const out = act([technomancer({ resonance: 7 }), blankSprite()], 'tm_sprite_compile:0', ['sp'], () => (used++ < 14 ? 6 : 1), { kind: 'крушитель', level: 7 });
    eq(computed(after(out, 'sp'), 'resonance'), 7);
  });
});

