import { group, test, eq, ok } from './harness.js';
import { state, blankWorld } from '../src/ui/state.js';
import { addGroup } from '../src/ui/field-editor.js';
import { addRoll } from '../src/ui/mode-author.js';
import { addConstant, addTable } from '../src/ui/rule-editor.js';
import { copyBlockFrom, copyRuleFrom } from '../src/ui/templates.js';
import { defaultModifier } from '../src/ui/mode-compendium.js';
import { SAMPLE_SYSTEMS } from '../src/model/systems.js';

// Конструктор открывается с ЧИСТОГО ЛИСТА, а не со спизженной целиком 5e:
// образцы — доноры в палитрах, из них намешивают, они не навязаны стартом.
// Пустая система обязана переживать все ручки конструктора — это тот же
// инвариант, что «интерфейс переживает любое промежуточное состояние правки».

const swap = () => {
  const saved = { system: state.system, compendium: state.compendium, sheets: state.sheets };
  const blank = blankWorld();
  state.system = blank.system;
  state.compendium = blank.compendium;
  state.sheets = blank.sheets;
  return () => { state.system = saved.system; state.compendium = saved.compendium; state.sheets = saved.sheets; };
};

group('конструктор с чистого листа', () => {
  test('пустой мир: ни полей, ни правил, ни родов — только то, что объявит автор', () => {
    const world = blankWorld();
    eq(world.system.fields.length, 0);
    eq(Object.keys(world.system.rules).length, 0);
    eq(Object.keys(world.system.records).length, 0);
    eq(world.system.rolls.length, 0);
    eq(world.compendium.items.length + world.compendium.effects.length + world.compendium.actions.length, 0);
    eq(world.sheets.length, 0);
    ok(world.system.name, 'имя есть сразу — его правит шапка автора');
  });

  test('в пустой системе работают все ручки: блок, мишень, константа, таблица', () => {
    const restore = swap();
    addGroup();
    eq(state.system.fields.length, 1, 'первый блок с первым полем');
    const tag = addRoll();
    ok(state.system.rolls.some(r => r.tag === tag));
    const cName = addConstant();
    ok(cName in state.system.constants);
    const tName = addTable();
    ok(tName in state.system.tables);
    restore();
  });

  test('пустая система наполняется смешением образцов', () => {
    const restore = swap();
    const dnd5e = SAMPLE_SYSTEMS.find(s => s.id === 'dnd5e-slice');
    const cp = SAMPLE_SYSTEMS.find(s => s.id === 'cp-slice');

    copyBlockFrom(dnd5e, 'Характеристики');
    eq(state.system.fields.length, 6, 'шесть характеристик 5e');

    const id = copyRuleFrom(cp, 'strike');
    ok(state.system.rules[id]);
    ok('lead_die' in state.system.constants, 'кость киберпанка приехала за правилом');
    eq(state.system.constants.lead_die.dice[0].sides, 10, 'именно киберпанковская d10');
    ok(state.system.rolls.some(r => r.tag === 'attack_roll'), 'и его мишень броска');
    restore();
  });

  test('заготовка модификатора не падает в системе без полей', () => {
    const restore = swap();
    const mod = defaultModifier(state.system);
    eq(mod.kind, 'value');
    eq(mod.target, null, 'мишени нет — честный null, а не TypeError');
    restore();
  });
});
