import { group, test, eq, deepEq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange, fight } from './play.ts';
import type { Clock } from '../src/engine/clock.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { breaches } from '../src/engine/limits.ts';
import { perform } from '../src/core/perform.ts';
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
const act = (sheets: Sheet[], actionId: string, to: string[], die: () => number, inputs?: Record<string, string | number>, clock?: Clock) =>
  exchange({ system, compendium, die, sheets, actionId, fromId: sheets[0]!.id, toIds: to, ...(inputs ? { inputs } : {}), ...(clock ? { clock } : {}) });

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

  const compiled = (kind: string, level = 4) => after(act([technomancer(), blankSprite()], 'tm_sprite_compile:0', ['sp'], tape(...six(5), ...one(5), 6, ...one(7), ...six(8)), { kind, level }), 'sp');
  const desk = { id: 'desk', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
  const withPerform = (sheets: Sheet[], op: Record<string, unknown>) => {
    const out = perform({ system, compendium, clock: null, sheets, die: () => 1 }, op as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    return out.sheets;
  };

  test('навыки спрайта по виду (стр. 193–194): техноспрайт — Инженерное дело и Электроника, без Взлома; крушитель — наоборот', () => {
    const techno = compiled('техноспрайт', 3);
    deepEq([computed(techno, 'skills.взлом.rank'), computed(techno, 'skills.инженерное_дело.rank'), computed(techno, 'skills.электроника.rank')], [0, 3, 3]);
    const crusher = compiled('крушитель', 4);
    deepEq([computed(crusher, 'skills.взлом.rank'), computed(crusher, 'skills.инженерное_дело.rank'), computed(crusher, 'skills.электроника.rank')], [4, 0, 4]);
  });

  test('«Ловушка» в бою (стр. 194): сложное действие снято; вторая сложная способность в тот же ход отказывает, задача не списана', () => {
    const sprite = { ...compiled('крушитель'), values: { ...compiled('крушитель').values, complex_left: 1 } } as Sheet;
    const first = act([sprite, decker(), desk], 'spw_trap:0', ['razor'], tape(...six(8), ...one(10)), undefined, fight('sp', 'razor'));
    eq(after(first, 'sp').values.complex_left, 0);
    eq(after(first, 'sp').values.tasks, 3);
    const why = refusal(() => act([after(first, 'sp'), after(first, 'razor'), desk], 'spw_trap:0', ['razor'], tape(...six(8), ...one(10)), undefined, fight('sp', 'razor')));
    ok(why.includes('сложное действие'), why);
  });

  test('«Ловушка» (стр. 194): любая следующая способность спрайта освобождает цель', () => {
    const sprite = compiled('крушитель');
    const first = act([sprite, decker()], 'spw_trap:0', ['razor'], tape(...six(8), ...one(10)));
    ok(wears(after(first, 'razor'), 'sprite_trap'));
    const second = act([after(first, 'sp'), after(first, 'razor')], 'spw_hash:0', ['razor'], () => 1);
    ok(!wears(after(second, 'razor'), 'sprite_trap'));
  });

  test('«Электрошторм» (стр. 195): урон Матрицы — когда спрайт применяет способность, а не каждый раунд; урон по спрайту шторм снимает', () => {
    const sprite = compiled('крушитель');
    const stormed = { ...decker(), effects: [{ effectId: 'sprite_storm', args: { спрайт: 'sp' } }] } as Sheet;
    const idle = withPerform([sprite, stormed], { op: 'turn', turn: 'start', order: ['razor'] });
    eq(Number(idle.find(s => s.id === 'razor')!.values.matrix_damage ?? 0), 0);
    const used = act([sprite, stormed], 'spw_hash:0', ['razor'], () => 1);
    ok(Number(after(used, 'razor').values.matrix_damage ?? 0) > 0);
    const hurt = withPerform([sprite, stormed], { op: 'set', sheetId: 'sp', tag: 'matrix_damage', value: 1 });
    ok(!wears(hurt.find(s => s.id === 'razor'), 'sprite_storm'));
  });
});

