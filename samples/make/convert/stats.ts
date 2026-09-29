import { moveToTable, movable } from '../../../packages/engine/src/model/rename.ts';
import { withTableFields } from '../../../packages/engine/src/model/sheet-columns.ts';

type Loose = Record<string, any>;

export function statsOf(world: Loose): Loose {
  let system = world.system;
  let compendium = world.compendium ?? null;
  for (const field of [...system.fields]) {
    if (!movable(field)) continue;
    const moved = moveToTable(system, compendium, field.tag);
    if (!moved) continue;
    system = moved.system;
    compendium = moved.compendium;
  }
  return { ...world, system: withTableFields(system), ...(compendium ? { compendium } : {}) };
}
