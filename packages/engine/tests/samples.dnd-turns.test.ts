import { group, test, eq, ok, throws } from './harness.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { exchange } from '../src/events/exchange.ts';
import { fireMoments } from '../src/events/moments.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!;
const system = dnd.system as System;
const compendium = dnd.compendium as Compendium;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const table = (battle: number): Sheet[] => {
  const sheets = clone(dnd.sheets as Sheet[]);
  const desk = sheets.find(s => s.id === 'стол')!;
  desk.values = { ...desk.values, battle };
  const goblin = sheets.find(s => s.id === 'goblin')!;
  goblin.values = { ...goblin.values, hp_current: 500, hp_max: 500 };
  return sheets;
};
const hit = (sheets: Sheet[]) => exchange({
  system, compendium, die: () => 10, sheets, actionId: 'longsword:0', fromId: 'arven', toId: 'goblin',
}).sheets;
const read = (sheet: Sheet, tag: string) => calc(system, sheet, tag, newPass(system, sheet, { compendium }));
const value = (sheets: Sheet[], tag: string) => read(sheets.find(s => s.id === 'arven')!, tag);

group('действия хода — поля листа, а не отдельный счётчик', () => {
  test('вне боя действия не тратятся: бей сколько хочешь', () => {
    let sheets = table(0);
    for (let i = 0; i < 3; i++) sheets = hit(sheets);
    eq(value(sheets, 'turn_action'), 1);
    eq(value(sheets, 'turn_attacks'), 0);
  });

  test('в бою первый удар тратит действие и даёт запас атак; кончились атаки и действие — отказ словами', () => {
    const perAction = Number(read((dnd.sheets as Sheet[]).find(s => s.id === 'arven')!, 'attacks_per_action'));
    ok(perAction >= 2, 'у Арвен дополнительная атака');
    let sheets = hit(table(1));
    eq(value(sheets, 'turn_action'), 0, 'действие потрачено первым ударом');
    eq(value(sheets, 'turn_attacks'), perAction - 1, 'в запасе остальные атаки этого действия');
    for (let i = 1; i < perAction; i++) sheets = hit(sheets);
    eq(value(sheets, 'turn_attacks'), 0);
    throws(() => hit(sheets), 'действие на этом ходу уже потрачено');
  });

  test('начало хода снова даёт действие, бонусное, реакцию', () => {
    const spent = hit(table(1));
    const out = fireMoments([{ moment: 'turn-start', sheetId: 'arven' }], spent, { system, compendium, die: () => 1 });
    eq(value(out.sheets, 'turn_action'), 1);
    eq(value(out.sheets, 'turn_reaction'), 1);
    eq(value(out.sheets, 'turn_attacks'), 0);
  });

  test('начало боя отмечает бой на столе, конец — снимает', () => {
    const started = fireMoments([{ moment: 'combat-start', sheetId: 'arven' }], table(0), { system, compendium, die: () => 1 });
    eq(started.sheets.find(s => s.id === 'стол')!.values.battle, 1);
    const ended = fireMoments([{ moment: 'combat-end', sheetId: 'arven' }], started.sheets, { system, compendium, die: () => 1 });
    eq(ended.sheets.find(s => s.id === 'стол')!.values.battle, 0);
  });
});
