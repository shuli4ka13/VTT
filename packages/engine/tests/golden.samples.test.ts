import { describe, it, expect } from 'vitest';
import dnd5e from './fixtures/frozen/dnd5e.world.json' with { type: 'json' };
import cyberpunk from './fixtures/frozen/cyberpunk.world.json' with { type: 'json' };
import { unifyWorld } from '../src/model/unify.ts';
import { availableActions } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';

const WORLDS: Record<string, any> = { dnd5e, cyberpunk };

const DICE: Record<string, (sides: number, n: number) => number> = {
  low: () => 1,
  high: sides => sides,
  walk: (sides, n) => ((n * 7 + 3) % sides) + 1,
};

const dieOf = (kind: string) => {
  let n = 0;
  return (sides: number) => DICE[kind]!(sides, n++);
};

function play(world: any, fromId: string, toId: string, actionId: string, kind: string, inCombat: boolean) {
  const { system, compendium } = unifyWorld({ system: world.system, compendium: world.compendium });
  const clock = inCombat ? startCombat(idleClock(), world.sheets.map((s: any) => s.id)) : null;
  try {
    const out = exchange({
      system, compendium, die: dieOf(kind), sheets: world.sheets, actionId, fromId, toId, clock,
    });
    return {
      reports: out.reports,
      sheets: out.sheets.map((s: any) => ({ id: s.id, values: s.values, effects: s.effects })),
    };
  } catch (err) {
    return { error: `${(err as Error).name}: ${(err as Error).message}` };
  }
}

for (const [name, world] of Object.entries(WORLDS)) {
  describe(`золотые трассы: ${name}`, () => {
    const { system, compendium } = unifyWorld({ system: world.system, compendium: world.compendium });

    it('замороженный образец не пуст', () => {
      expect(world.sheets.length).toBeGreaterThan(1);
      expect(Object.keys(system.effects).length).toBeGreaterThan(0);
    });

    for (const from of world.sheets) {
      const actions = availableActions(from, { system, compendium });
      const targets = world.sheets.filter((s: any) => s.id !== from.id);
      for (const action of actions) {
        for (const to of [...targets, from]) {
          for (const kind of Object.keys(DICE)) {
            for (const inCombat of [false, true]) {
              it(`${from.id} → ${to.id} · ${action.id} · кости ${kind} · ${inCombat ? 'в бою' : 'вне боя'}`, () => {
                expect(play(world, from.id, to.id, action.id, kind, inCombat)).toMatchSnapshot();
              });
            }
          }
        }
      }
    }
  });
}
