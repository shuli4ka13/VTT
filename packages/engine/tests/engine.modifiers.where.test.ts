import { group, test, eq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Compendium, Sheet } from '../src/model/types.ts';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const удар = (оружие: string, ярость: boolean, правка?: (s: System) => void, кожа = false) => {
  const мир = clone(PLAYABLE_WORLDS[0]!);
  const system = мир.system as System;
  правка?.(system);
  const sheets = мир.sheets as Sheet[];
  const бьющий = clone(sheets[0]!);
  (бьющий as Record<string, unknown>).has = [...(бьющий.has ?? []), { of: оружие }];
  const цель = clone(sheets[5]!);
  (цель.values as Record<string, unknown>).hp_current = 200;
  if (ярость) (цель as Record<string, unknown>).effects = [...(цель.effects ?? []), { effectId: 'raging' }];
  if (кожа) (цель as Record<string, unknown>).effects = [...(цель.effects ?? []), { effectId: 'stoneskin' }];
  const out = exchange({
    system, compendium: мир.compendium as Compendium, die: () => 18,
    sheets: [бьющий, цель], actionId: `${оружие}:0`, fromId: бьющий.id, toId: цель.id, inputs: {},
  });
  const шаги = out.reports.flatMap(r => (r as { report?: { trace?: Record<string, unknown>[] } }).report?.trace ?? []);
  return шаги.filter(t => t.type === 'emit').map(t => Number(t.amount));
};

group('правка по свойству метки — один факт вместо перечня', () => {
  test('ярость режет рубящий: у него природа — физический', () => {
    const [обычно] = удар('longsword', false);
    const [вЯрости] = удар('longsword', true);
    eq(вЯрости, Math.floor(обычно! / 2));
  });

  test('огонь той же ярости не касается', () => {
    const [, огонь] = удар('flame_tongue', true);
    const [, безЯрости] = удар('flame_tongue', false);
    eq(огонь, безЯрости);
  });

  test('перевели тип в другую природу — ярость перестала его резать, эффекты не трогали', () => {
    const [обычно] = удар('longsword', false);
    const [переведён] = удар('longsword', true, system => {
      const row = system.tables!.damage_types!.rows!.find(r => r.value === 'рубящий')!;
      row.cells = { ...row.cells, nature: 'прочий' };
    });
    eq(переведён, обычно);
  });
});

group('источник урона — отдельный словарь, а не тип', () => {
  test('каменная кожа режет обычный меч вдвое', () => {
    const [обычно] = удар('longsword', false);
    const [сКожей] = удар('longsword', false, undefined, true);
    eq(сКожей, Math.floor(обычно! / 2));
  });

  test('меч +1 магический — каменная кожа его не режет', () => {
    const [обычно] = удар('magic_sword_1', false);
    const [сКожей] = удар('magic_sword_1', false, undefined, true);
    eq(typeof обычно === 'number' && обычно > 1, true, `урон был: ${обычно}`);
    eq(сКожей, обычно);
  });

  test('«магический» больше не тип урона, а строка «Источника урона»', () => {
    const system = PLAYABLE_WORLDS[0]!.system as System;
    eq(system.tables!.damage_types!.rows!.some(r => r.value === 'магический'), false);
    eq(system.tables!.damage_source!.rows!.some(r => r.value === 'магический'), true);
  });
});
