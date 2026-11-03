import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { exchange } from './play.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';
import type { Sheet } from '../src/model/types.ts';

const DICE: Record<string, (sides: number, n: number) => number> = {
  low: () => 1,
  high: sides => sides,
  walk: (sides, n) => ((n * 7 + 3) % sides) + 1,
};

const dieOf = (kind: string) => {
  let n = 0;
  return (sides: number) => DICE[kind]!(sides, n++);
};

function outcome(before: Sheet[], after: Sheet[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sheet of after) {
    const was = before.find(s => s.id === sheet.id);
    const values = Object.fromEntries(Object.entries(sheet.values).filter(([key, value]) => JSON.stringify(was?.values[key]) !== JSON.stringify(value)));
    const effects = (sheet.effects ?? []).map(({ inst: _inst, ...rest }: Record<string, unknown>) => rest);
    const wasEffects = (was?.effects ?? []).map(({ inst: _inst, ...rest }: Record<string, unknown>) => rest);
    const changed = JSON.stringify(effects) !== JSON.stringify(wasEffects);
    if (Object.keys(values).length || changed) out[sheet.id] = { ...(Object.keys(values).length ? { values } : {}), ...(changed ? { effects } : {}) };
  }
  return out;
}

for (const world of SAMPLE_WORLDS) {
  const system = flattenSystem(world.system);
  const compendium = world.compendium;
  const players = world.sheets.filter((s: Sheet) => s.id !== 'стол');

  describe.skipIf(!process.env.GOLDEN_SAMPLES)(`итоги действий: ${system.id}`, () => {
    for (const from of players) {
      for (const action of availableActions(from, { system, compendium })) {
        it(`${from.id} · ${action.id}`, () => {
          const cases: Record<string, unknown> = {};
          for (const to of [...players.filter((s: Sheet) => s.id !== from.id), from]) {
            for (const kind of Object.keys(DICE)) {
              for (const inCombat of [false, true]) {
                const clock = inCombat ? startCombat(idleClock(), world.sheets.map((s: Sheet) => s.id)) : null;
                const key = `→ ${to.id} · ${kind} · ${inCombat ? 'бой' : 'вне боя'}`;
                try {
                  const out = exchange({ system, compendium, die: dieOf(kind), sheets: world.sheets, actionId: action.id, fromId: from.id, toId: to.id, clock });
                  cases[key] = outcome(world.sheets, out.sheets);
                } catch (err) {
                  cases[key] = `${(err as Error).name}: ${(err as Error).message}`;
                }
              }
            }
          }
          expect(cases).toMatchSnapshot();
        }, 60_000);
      }
    }
  });
}
