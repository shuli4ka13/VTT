import { group, test, eq, deepEq, ok } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange, fight } from './play.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { asksOf, checkInputs } from '../src/model/asks.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}, has: Sheet['has'] = []) => {
  const sheet = structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values }, has: [...sheet.has, ...has] } as Sheet;
};
const computed = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const wears = (sheet: Sheet | undefined, id: string) => (sheet?.effects ?? []).some(e => e.effectId === id);
const dice = (...runs: [number, number][]) => {
  const tape = runs.flatMap(([n, value]) => Array(n).fill(value) as number[]);
  return () => tape.shift() ?? 1;
};
const after = (out: ReturnType<typeof exchange>, id: string) => out.sheets.find(s => s.id === id)!;
const refusal = (fn: () => unknown) => { try { fn(); return ''; } catch (error) { return (error as Error).message; } };

const decker = (values: Record<string, unknown> = {}, has: Sheet['has'] = []) => sheetOf('razor', { 'skills.взлом.rank': 6, logic: 5, matrix_mode: 'горячая ВР', ...values },
  [{ of: 'dev_deck_erika_mcd6' }, { of: 'dev_comm_transys_avalon' }, { of: 'mx_spike' }, { of: 'mx_tarpit' }, { of: 'mx_brute' }, ...has]);
const victim = (values: Record<string, unknown> = {}) => ({ ...decker(values), id: 'жертва', name: 'Жертва' } as Sheet);
const act = (from: Sheet, to: Sheet[], actionId: string, die: () => number, inputs?: Record<string, string | number>) =>
  exchange({ system, compendium, die, sheets: [from, ...to], actionId, fromId: from.id, toIds: to.map(s => s.id), ...(inputs ? { inputs } : {}) });

group('Shadowrun 6: персона в Матрице', () => {
  test('кибердека и коммуникатор: П/У от деки, ВМ/СЭ от коммуникатора, рейтинг — больший (стр. 174)', () => {
    const d = decker();
    deepEq([computed(d, 'm_attack'), computed(d, 'm_sleaze'), computed(d, 'm_dp'), computed(d, 'm_firewall'), computed(d, 'dev_rating')], [4, 3, 3, 1, 6]);
    deepEq([computed(d, 'matrix_ar'), computed(d, 'matrix_dr'), computed(d, 'matrix_cm')], [7, 4, 11]);
  });

  test('инициатива в ВР: Интуиция + ВМ; кубики 2к6 холодная, 3к6 горячая (стр. 178)', () => {
    deepEq([computed(decker(), 'initiative'), computed(decker(), 'init_dice')], [4 + 3, 3]);
    eq(computed(decker({ matrix_mode: 'холодная ВР' }), 'init_dice'), 2);
    eq(computed(decker({ matrix_mode: 'нет' }), 'init_dice'), 1);
  });

  test('реконфигурация меняет местами П и У; программа «Инструментарий» +1 ВМ', () => {
    const d = decker({ cfg_attack: 'У', cfg_sleaze: 'П' }, [{ of: 'prog_toolkit' }]);
    deepEq([computed(d, 'm_attack'), computed(d, 'm_sleaze'), computed(d, 'm_dp')], [3, 4, 4]);
  });

  test('РПУ снижает шум на свой рейтинг (стр. 177)', () => {
    eq(computed(sheetOf('razor', { noise: 5 }, [{ of: 'dev_rcc_dronemaster' }]), 'noise'), 2);
  });

  test('урон Матрицы: −1 за каждые 3 ячейки к проверкам «матрица» (стр. 174)', () => {
    eq(computed(decker({ matrix_damage: 7 }), 'matrix_wound'), -2);
  });
});

group('Shadowrun 6: действия в Матрице', () => {
  test('Инфошип: ⌈ЗА / 2⌉ + чистые успехи урона Матрицы, ПН + успехи защиты (стр. 181, 176)', () => {
    const out = act(decker(), [victim({ matrix_mode: 'нет' })], 'mx_spike:0', dice([6, 6], [5, 1], [1, 11]));
    eq(after(out, 'жертва').values.matrix_damage, 4 + 6 - 1);
    eq(after(out, 'razor').values.overwatch, 1);
  });

  test('Смоляная яма: 1 + чистые урона и снижение ВМ цели (стр. 184)', () => {
    const out = act(decker(), [victim({ matrix_mode: 'нет' })], 'mx_tarpit:0', dice([3, 6], [20, 1]));
    eq(after(out, 'жертва').values.matrix_damage, 4);
    ok(wears(after(out, 'жертва'), 'matrix_drain'));
  });

  test('Смоляная яма (стр. 184): снижается Вычислительная мощность цели; при ВМ 0 действие в Матрице отказывает', () => {
    const before = computed(victim({ matrix_mode: 'нет' }), 'm_dp') as number;
    const out = act(decker(), [victim({ matrix_mode: 'нет' })], 'mx_tarpit:0', dice([3, 6], [20, 1]));
    eq(computed(after(out, 'жертва'), 'm_dp'), Math.max(0, before - 4));
    const drained = { ...decker(), effects: [{ effectId: 'matrix_drain', args: { amount: 99 } }] } as Sheet;
    const why = refusal(() => act(drained, [victim()], 'mx_spike:0', dice([30, 1])));
    ok(why.includes('снижена до 0'), why);
  });

  test('Брутфорс: успех — висящий «Доступ»; админ без пользователя — защита +2 кубика (стр. 180)', () => {
    const out = act(decker(), [victim()], 'mx_brute:0', dice([11, 6], [20, 1]), { level: 'администратор', had_user: 'нет' });
    ok(wears(after(out, 'razor'), 'matrix_access'));
    ok(out.log.join('\n').includes('Бросок (защита, матрица): [1, 1, 1, 1, 1, 1]'));
  });

  test('одна цель; больше — только с «Разветвлением» (стр. 185)', () => {
    const two = [victim(), { ...victim(), id: 'вторая' } as Sheet];
    ok(refusal(() => act(decker(), two, 'mx_spike:0', dice([30, 1]))).includes('Разветвление'));
    eq(refusal(() => act(decker({}, [{ of: 'prog_fork' }]), two, 'mx_spike:0', dice([30, 1]))), '');
  });

  test('без устройства и при шуме больше рейтинга — отказ (стр. 177)', () => {
    const bare = sheetOf('razor', {}, [{ of: 'mx_spike' }]);
    const why = refusal(() => act(bare, [victim()], 'mx_spike:0', dice([30, 1])));
    ok(why.includes('нет устройства'), why);
    ok(refusal(() => act(decker({ noise: 7 }), [victim()], 'mx_spike:0', dice([30, 1]))).includes('шум'));
  });

  test('Биоотдача по цели в горячем симе — физический урон через Волю; Локдаун — залипание (стр. 185)', () => {
    const out = act(decker({}, [{ of: 'prog_biofeedback' }, { of: 'prog_lockdown' }]), [victim()], 'mx_spike:0', dice([6, 6], [5, 1], [1, 1], [3, 1]));
    eq(after(out, 'жертва').values.physical, 10);
    ok(wears(after(out, 'жертва'), 'link_lock'));
  });
});

group('Shadowrun 6: показатель надзора', () => {
  test('ПН 40 — конвергенция: устройство сдохло, выброс с демпшоком (стр. 176)', () => {
    const out = act(decker({ overwatch: 38 }), [victim()], 'mx_spike:0', dice([11, 1], [3, 6], [20, 1]));
    const d = after(out, 'razor');
    eq(d.values.overwatch, 0);
    eq(d.values.matrix_damage, computed(d, 'matrix_cm'));
    ok(wears(d, 'dumpshocked'));
  });
});

group('Shadowrun 6: сервер и лёд', () => {
  test('сервер рейтинга 4 (П5 У4 ВМ7 СЭ6): ЗЩ 13; лёд — счётчик 8, инициатива ВМ × 2 + 3к6 (стр. 185–186)', () => {
    const host = sheetOf('baraholka');
    const ice = sheetOf('baraholka_killer');
    deepEq([computed(host, 'matrix_dr'), computed(ice, 'matrix_ar'), computed(ice, 'matrix_cm'), computed(ice, 'initiative'), computed(ice, 'init_dice')], [13, 9, 8, 14, 3]);
  });

  test('убивающий лёд: чистые успехи + рейтинг; полный счётчик — устройство сдохло, демпшок (стр. 188, 174)', () => {
    const out = act(sheetOf('baraholka_killer'), [decker({ matrix_damage: 1 })], '+ic_attack', dice([6, 6], [2, 1], [5, 1], [1, 1], [3, 1]));
    const d = after(out, 'razor');
    eq(d.values.matrix_damage, 11);
    ok(wears(d, 'dumpshocked'), out.log.join('\n'));
    eq(d.values.physical, 3);
    eq(d.values.matrix_mode, 'нет');
  });

  test('дозорный лёд (стр. 187): в бою тратит простое действие, сложное не тронуто, урона нет', () => {
    const desk = { id: 'стол', systemId: 'shadowrun6', name: 'Стол', values: {}, has: [], effects: [] } as unknown as Sheet;
    const watcher = sheetOf('baraholka_killer', { ic_kind: 'дозорный', simple_left: 3, complex_left: 1 });
    const out = exchange({ system, compendium, die: dice([6, 6], [20, 1]), sheets: [watcher, decker(), desk], clock: fight('baraholka_killer', 'razor'), actionId: '+ic_attack', fromId: 'baraholka_killer', toIds: ['razor'] });
    eq(after(out, 'baraholka_killer').values.simple_left, 2);
    eq(after(out, 'baraholka_killer').values.complex_left, 1);
    eq(Number(after(out, 'razor').values.matrix_damage ?? 0), 0);
  });

  test('едкий лёд: Сетевой экран −1 за чистый успех, не ниже 0 (стр. 187)', () => {
    const out = act(sheetOf('baraholka_killer', { ic_kind: 'едкий' }), [decker()], '+ic_attack', dice([6, 6], [2, 1], [20, 1]));
    eq(computed(after(out, 'razor'), 'm_firewall'), 0);
  });
});

group('Shadowrun 6, глава «Матрица»: ситуации книжника (стр. 170–188)', () => {
  test('MX-4 (стр. 180, 46): брутфорс администратора без доступа — ЗЩ +4: при ЗА − ЗЩ = 4 очка уже нет', () => {
    const user = act(decker({ edge_left: 0 }), [victim()], 'mx_brute:0', dice([30, 1]), { level: 'пользователь', had_user: 'нет' });
    const admin = act(decker({ edge_left: 0 }), [victim()], 'mx_brute:0', dice([30, 1]), { level: 'администратор', had_user: 'нет' });
    const gain = (out: ReturnType<typeof exchange>) => Number(after(out, 'razor').values.edge_left ?? 0);
    eq(computed(decker(), 'matrix_ar') - computed(victim(), 'matrix_dr'), 3);
    eq(gain(user), 0);
    eq(gain(admin), 0);
  });

  test('MX-7 (стр. 176): демпшок — холодный сим 3о, горячий 3ф, сопротивление Волей; дезориентация', () => {
    const hit = (mode: string) => act(sheetOf('baraholka_killer'), [decker({ matrix_damage: 2, matrix_mode: mode, willpower: 4 })], '+ic_attack', dice([6, 6], [2, 1], [5, 1], [1, 6], [1, 6], [1, 5], [2, 2], [20, 2]));
    const cold = after(hit('холодная ВР'), 'razor');
    const hot = after(hit('горячая ВР'), 'razor');
    eq(cold.values.stun, 1);
    eq(hot.values.physical, 1);
    ok(wears(cold, 'dumpshocked') && wears(hot, 'dumpshocked'));
    eq(cold.effects.find(e => e.effectId === 'dumpshocked')?.args?.минут, 6, '10 − Воля 4 = 6 минут');
  });

  test('MX-7б (стр. 176): при Воле 10 демпшок есть (выброс из Матрицы), а дезориентации нет', () => {
    const out = act(sheetOf('baraholka_killer'), [decker({ matrix_damage: 2, matrix_mode: 'холодная ВР', willpower: 10 })], '+ic_attack', dice([6, 6], [2, 1], [5, 1], [1, 6], [1, 6], [1, 5], [2, 2], [20, 2]));
    const d = after(out, 'razor');
    eq(d.values.matrix_mode, 'нет');
    ok(!wears(d, 'dumpshocked'));
  });

  test('вопрос «да/нет»: «Доступ пользователя уже есть» — «да» снимает +2 к защите; иное слово — отказ', () => {
    const defense = (had: string) => {
      const out = act(decker(), [victim()], 'mx_brute:0', dice([40, 1]), { level: 'администратор', had_user: had });
      return out.reports.flatMap(r => (r.report.trace ?? []) as { step: unknown; rolls?: number[] }[]).find(t => t.step === 'отпор')?.rolls?.length;
    };
    eq((defense('нет') ?? 0) - (defense('да') ?? 0), 2);
    const asked = asksOf('mx_brute:0', { system, compendium });
    ok(String(checkInputs(asked, { level: 'администратор', had_user: 'может' }, system)).includes('«да» или «нет»'));
    eq(checkInputs(asked, { level: 'администратор', had_user: 'да' }, system), null);
  });
});

