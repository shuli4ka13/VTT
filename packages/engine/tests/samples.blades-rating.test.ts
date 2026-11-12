import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';

const world = SAMPLE_WORLDS.find(one => one.system.id === 'blades')!;
const system = flattenSystem(world.system);

const queue = (...values: number[]) => {
  const thrown: number[] = [];
  const die = () => { const value = values.shift() ?? 1; thrown.push(value); return value; };
  return { die, thrown };
};

const click = (tag: string, ...values: number[]) => {
  const dice = queue(...values);
  const out = perform({ system, compendium: world.compendium, clock: null, sheets: world.sheets, die: dice.die } as never, { op: 'roll', sheetId: 'vex', tag } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return { log: out.log.join('\n'), thrown: dice.thrown };
};

describe('Blades: рейтинг действия бросается с листа и в эффекте одним правилом', () => {
  it('щелчок по рейтингу 2 — две кости, берётся лучшая', () => {
    const out = click('skirmish', 3, 5);
    expect(out.thrown).toEqual([3, 5]);
    expect(out.log).toContain('= 5');
  });

  it('щелчок по рейтингу 0 — две кости, берётся худшая', () => {
    const out = click('finesse', 6, 2);
    expect(out.thrown).toEqual([6, 2]);
    expect(out.log).toContain('= 2');
    expect(out.log).toContain('Без рейтинга');
  });

  it('действие из книги бросает то же поле: рейтинг 2 — лучшая из двух', () => {
    const dice = queue(3, 5);
    const out = exchange({ system, compendium: world.compendium, die: dice.die, sheets: world.sheets, actionId: 'act_skirmish:0', fromId: 'vex', toId: 'mira' } as never);
    expect(dice.thrown).toEqual([3, 5]);
    expect(out.log.join('\n')).toContain('5 против 4');
  });

  it('действие при рейтинге 0 — худшая из двух', () => {
    const dice = queue(6, 2);
    const out = exchange({ system, compendium: world.compendium, die: dice.die, sheets: world.sheets, actionId: 'act_sway:0', fromId: 'vex', toId: 'mira' } as never);
    expect(dice.thrown).toEqual([6, 2]);
    expect(out.log.join('\n')).toContain('2 против 4');
  });
});
