import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fields, groups, tables, constants, rollEdits, calledEffects, lists, INITIATIVE_TAGS } from './dnd5e.system.mjs';
import { effects, ROOM_RULES } from './dnd5e.effects.mjs';
import { records } from './dnd5e.records.mjs';
import { compendium } from './dnd5e.book.mjs';
import { sheets, mannequins } from './dnd5e.sheets.mjs';
import { unifyAmounts } from './convert/amounts.ts';
import { unifyCalls } from './convert/calls.ts';
import { unifySides } from './convert/sides.ts';

const world = {
  title: 'D&D 5e',
  system: {
    id: 'dnd5e',
    name: 'D&D 5e',
    fields: fields(),
    groups: groups(),
    constants: constants(),
    tables: { ...tables(), ...lists() },
    roll_edits: rollEdits(),
    initiative: { die: { constant: 'lead_die' }, bonus: { expr: '@initiative' }, tags: INITIATIVE_TAGS },
    effects: { ...effects(), ...calledEffects() },
    records: records(),
    room_rules: ROOM_RULES,
    mannequins: mannequins(),
  },
  compendium: compendium(),
  sheets: sheets(),
};

world.system = unifyCalls(unifyAmounts(world.system));
Object.assign(world, unifySides({ system: world.system, compendium: world.compendium }));

const out = fileURLToPath(new URL('../dnd5e.world.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(world, null, 2)}\n`);

const count = {
  'полей': world.system.fields.length,
  'эффектов': Object.keys(world.system.effects).length,
  'типов записей': Object.keys(world.system.records).length,
  'записей книги': world.compendium.items.length + world.compendium.actions.length,
  'листов': world.sheets.length,
  'таблиц': Object.keys(world.system.tables).length,
};
console.log(Object.entries(count).map(([what, n]) => `${what}: ${n}`).join(', '));
