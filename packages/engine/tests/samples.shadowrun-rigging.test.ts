import { group, test, eq } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { exchange } from './play.ts';
import { rollInitiative } from './kit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const sr = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'shadowrun6')!;
const system = sr.system as System;
const compendium = sr.compendium as Compendium;
const sheetOf = (id: string, values: Record<string, unknown> = {}) => {
  const sheet = structuredClone(sr.sheets.find(s => s.id === id)!) as Sheet;
  return { ...sheet, values: { ...sheet.values, ...values } } as Sheet;
};
const at = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const tape = (...faces: number[]) => { const rest = [...faces]; return () => rest.shift() ?? 2; };

group('Shadowrun 6, глава «Риггинг»: ситуации книжника (стр. 196–201)', () => {
  test('rig-7 (стр. 201): инициатива автономного дрона — Пилот × 2 + 4к6', () => {
    const drone = sheetOf('drone_doberman');
    eq(at(drone, 'initiative'), 4);
    eq(at(drone, 'init_dice'), 4);
    eq(rollInitiative(system, [drone], compendium, tape(6, 5, 2, 1)).rolls[0]!.total, 18);
  });

  test('rig-5 (стр. 196, 201): счётчик 8 + ⌈Тело/2⌉; управляемость +1 за каждые 3 ячейки', () => {
    const drone = sheetOf('drone_doberman');
    eq(at(drone, 'physical_max'), 10);
    eq(at(sheetOf('drone_doberman', { physical: 7 }), 'veh_handling'), at(drone, 'veh_handling') as number + 2);
  });

  test('rig-8 (стр. 201): ЗЩ автономного дрона — Маневрирование + Броня', () => {
    const drone = sheetOf('drone_doberman');
    eq(at(drone, 'defense_rating'), (at(drone, 'as_maneuver') as number) + 6);
  });

  test('rig-5 (стр. 196, п. 7): к оглушающему с СУ не больше Тела транспорт невосприимчив — сравнивается СУ атаки, а не остаток', () => {
    const thug = sheetOf('mafia', { edge_left: 0 });
    const hit = (faces: number[]) => exchange({
      system, compendium, die: tape(...faces), sheets: [thug, sheetOf('drone_doberman')], actionId: 'sap:0', fromId: 'mafia', toIds: ['drone_doberman'],
    }).sheets.find(s => s.id === 'drone_doberman')!;
    eq(hit([5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]).values.stun ?? 0, 0, 'СУ 2 + 2 = 4 — не больше Тела 4');
    eq(hit([5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 2, 2]).values.stun, 3, 'СУ 2 + 3 = 5 больше Тела 4 — проходит; сопротивление Телом модели 4 кубика, 2 успеха — остаток 3');
  });

  test('rig-5 (стр. 114, 196): оглушающая граната по транспорту — сравнивается СУ до сопротивления; электрическая действует и при СУ не больше Тела', () => {
    const grenade = (dv: number, electric: boolean) => ({ id: 'grenade_probe', table: 'grenade', label: 'Проба', cells: { dv_e: dv, dv_c: dv, dv_n: dv, blast: 5, physical_dmg: false, electric } });
    const thrown = (dv: number, electric: boolean) => {
      const thrower = { ...sheetOf('mafia', { edge_left: 0 }), has: [{ of: 'grenade_probe', values: { count: 2 } }] } as Sheet;
      return exchange({
        system, compendium: { ...compendium, records: [...compendium.records, grenade(dv, electric)] } as Compendium, die: tape(), sheets: [thrower, sheetOf('drone_doberman')],
        actionId: 'grenade_probe:0', fromId: 'mafia', toIds: ['drone_doberman'], inputs: { distanciya: 'blizkaya', kolco: { drone_doberman: 'epicentr' } } as never,
      }).sheets.find(s => s.id === 'drone_doberman')!;
    };
    eq(thrown(4, false).values.stun ?? 0, 0, 'СУ 4 не больше Тела 4');
    eq((thrown(6, false).values.stun as number) > 0, true, 'СУ 6 больше Тела 4');
    eq((thrown(4, true).values.stun as number) > 0, true, 'электрическая при СУ не больше Тела');
  });
});
