import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';

const WORLDS: Record<string, any> = Object.fromEntries(SAMPLE_WORLDS.map(w => [w.system.id, w]));

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
  const system = flattenSystem(world.system);
  const compendium = world.compendium;
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
    const system = flattenSystem(world.system);
  const compendium = world.compendium;

    it('образец не пуст', () => {
      expect(world.sheets.length).toBeGreaterThan(1);
      expect(Object.keys(system.effects).length).toBeGreaterThan(0);
    });

    const players = world.sheets.filter((s: any) => s.id !== 'стол');
    for (const from of players) {
      const actions = availableActions(from, { system, compendium });
      const targets = players.filter((s: any) => s.id !== from.id);
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
