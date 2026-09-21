import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fields, groups, tables, constants, rolls, rollEdits, actionTypes, calledEffects, lists } from './dnd5e.system.mjs';
import { effects, ROOM_RULES } from './dnd5e.effects.mjs';
import { records } from './dnd5e.records.mjs';
import { compendium } from './dnd5e.book.mjs';
import { sheets, mannequins } from './dnd5e.sheets.mjs';

const world = {
  title: 'D&D 5e',
  system: {
    id: 'dnd5e',
    name: 'D&D 5e',
    fields: fields(),
    groups: groups(),
    constants: constants(),
    tables: tables(),
    rolls: rolls(),
    roll_edits: rollEdits(),
    lists: lists(),
    action_types: actionTypes(),
    initiative: { die: { constant: 'lead_die' }, bonus: { expr: '#initiative' }, check: 'skill_roll' },
    effects: { ...effects(), ...calledEffects() },
    records: records(),
    room_rules: ROOM_RULES,
    mannequins: mannequins(),
  },
  compendium: compendium(),
  sheets: sheets(),
};

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
