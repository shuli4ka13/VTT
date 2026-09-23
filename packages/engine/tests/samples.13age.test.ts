import { group, test, eq, deepEq } from './harness.ts';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { exchange } from '../src/events/exchange.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { Sheet } from '../src/model/types.ts';

const world = SAMPLE_WORLDS.find(w => w.system.id === '13age')!;
const system = flattenSystem(world.system);
const book = world.compendium;
const fresh = () => JSON.parse(JSON.stringify(world.sheets)) as Sheet[];
const queue = (...values: number[]) => () => values.shift() ?? 1;

const act = (sheets: Sheet[], actionId: string, fromId: string, toId: string, ...dice: number[]) =>
  exchange({ system, compendium: book, die: queue(...dice), sheets, actionId, fromId, toId });
const of = (sheets: Sheet[], id: string) => sheets.find(s => s.id === id)!;

group('13th Age: кость эскалации на столе', () => {
  test('образец чист для проверок конструктора', () => {
    deepEq(errorsOf(lintSystem(system, book)).map(p => p.text), []);
  });

  test('без эскалации Кай на 9 не попадает по гоблину (9 + 4 + 2 = 15 < 16) — урон промаха, равный уровню', () => {
    const out = act(fresh(), 'longsword:0', 'kai', 'goblin', 9);
    eq(of(out.sheets, 'goblin').values.hp, 10 - 2);
  });

  test('два «Новых раунда» — эскалация +2, тот же бросок по орку попадает: 2к8 + 4', () => {
    let sheets = fresh();
    sheets = act(sheets, 'new_round:0', 'kai', 'kai').sheets;
    sheets = act(sheets, 'new_round:0', 'kai', 'kai').sheets;
    eq(of(sheets, 'стол').values.escalation, 2);
    const out = act(sheets, 'longsword:0', 'kai', 'orc', 9, 3, 5);
    eq(of(out.sheets, 'orc').values.hp, 30 - (3 + 5 + 4));
  });

  test('эскалация не растёт выше 6', () => {
    let sheets = fresh();
    for (let i = 0; i < 9; i++) sheets = act(sheets, 'new_round:0', 'kai', 'kai').sheets;
    eq(of(sheets, 'стол').values.escalation, 6);
    eq(of(act(sheets, 'end_battle:0', 'kai', 'kai').sheets, 'стол').values.escalation, 0);
  });

  test('монстр эскалацию не получает: орк на 8 (8 + 7 = 15) не пробивает КЗ 17 Кая даже при +6', () => {
    let sheets = fresh();
    for (let i = 0; i < 6; i++) sheets = act(sheets, 'new_round:0', 'kai', 'kai').sheets;
    const out = act(sheets, 'orc_axe:0', 'orc', 'kai', 8);
    eq(of(out.sheets, 'kai').values.hp, 30);
  });

  test('натуральная 20 — кости оружия вдвое', () => {
    const out = act(fresh(), 'longbow:0', 'leya', 'orc', 20, 1, 1, 1, 1);
    eq(of(out.sheets, 'orc').values.hp, 30 - (4 + 4));
  });
});
