import { group, test, eq, deepEq } from './harness.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { Sheet } from '../src/model/types.ts';

const world = SAMPLE_WORLDS.find(w => w.system.id === 'blades')!;
const system = flattenSystem(world.system);
const book = world.compendium;
const fresh = () => JSON.parse(JSON.stringify(world.sheets)) as Sheet[];
const queue = (...values: number[]) => () => values.shift() ?? 1;
const act = (sheets: Sheet[], actionId: string, who: string, ...dice: number[]) =>
  exchange({ system, compendium: book, die: queue(...dice), sheets, actionId, fromId: who, toId: who });
const desk = (sheets: Sheet[]) => sheets.find(s => s.id === 'стол')!.values;
const crew = (sheets: Sheet[]) => sheets.find(s => s.id === 'crew')!.values;

group('Blades: эффекты крутят часы на столе', () => {
  test('образец чист для проверок конструктора', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('драка Векса (2 кости): лучшая 6 — успех, часы стоят', () => {
    const out = act(fresh(), 'act_skirmish:0', 'vex', 2, 6);
    eq(desk(out.sheets).alarm, 0);
  });

  test('лучшая 5 — успех с последствием: тревога +1', () => {
    const out = act(fresh(), 'act_skirmish:0', 'vex', 5, 1);
    eq(desk(out.sheets).alarm, 1);
  });

  test('лучшая 3 — провал: тревога +2, и часы не переполняются выше 8', () => {
    let sheets = fresh();
    for (let i = 0; i < 5; i++) sheets = act(sheets, 'act_skirmish:0', 'vex', 3, 2).sheets;
    eq(desk(sheets).alarm, 8);
  });

  test('«Залечь на дно» остужает банду — Жар один на всю банду', () => {
    const hot = fresh().map(sheet => (sheet.id === 'crew' ? { ...sheet, values: { ...sheet.values, heat: 5 } } : sheet));
    const lay = (sheets: Sheet[], who: string, die: number) =>
      exchange({ system, compendium: book, die: queue(die), sheets, actionId: 'lay_low:0', fromId: who, toId: who, inputs: { rating: 1 } }).sheets;
    let sheets = lay(hot, 'mira', 2);
    eq(crew(sheets).heat, 4, 'кость 2 — жар −1');
    sheets = lay(sheets, 'vex', 6);
    eq(crew(sheets).heat, 1, 'Векс остужает ту же банду: кость 6 — жар −3');
  });

  test('пул берётся по рейтингу бросающего: у Миры в скрытности 3 кости', () => {
    const out = act(fresh(), 'act_prowl:0', 'mira', 1, 2, 6);
    eq(desk(out.sheets).alarm, 0, 'третья кость — шестёрка, успех');
  });
});

group('Blades: без рейтинга — две кости, худшая', () => {
  test('у Миры «Изучение» 0: 6 и 2 — берётся 2, провал, тревога +2', () => {
    const out = act(fresh(), 'act_study:0', 'mira', 6, 2);
    eq(desk(out.sheets).alarm, 2);
  });

  test('с рейтингом берётся лучшая, как прежде: драка Векса 2 и 6 — успех', () => {
    eq(desk(act(fresh(), 'act_skirmish:0', 'vex', 2, 6).sheets).alarm, 0);
  });
});
