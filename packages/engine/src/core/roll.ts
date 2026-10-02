import { rollEdits } from './edits.ts';
import type { Held } from './edits.ts';
import { parse, times, start, keep, result } from './dice.ts';
import type { Roll, RollResult, Spec } from './dice.ts';
import type { Pass } from '../engine/calc.ts';
import type { Tools } from '../formula/index.ts';
import type { Die } from '../model/types.ts';

export interface Throw {
  spec: Spec;
  roller: Pass;
  held: Held[];
  tags: readonly string[];
  claims: readonly string[];
  die: Die;
  seen?: (roll: Roll) => Roll;
}

export interface Thrown {
  roll: Roll;
  result: RollResult;
  bonus: number;
}

export function throwDice(t: Throw): Thrown {
  const { edits, bonus } = rollEdits(t.held, t.claims, t.roller, t.tags);
  const thrown = start(t.spec, edits, t.die, t.tags);
  const roll = t.seen ? t.seen(thrown) : thrown;
  return { roll, result: result(roll), bonus };
}

export function diceTools(die?: Die): Pick<Tools, 'roll' | 'peak'> {
  return {
    ...(die ? {
      roll: (notation: string, many: number, best?: number) => {
        if (Math.floor(many) < 1) return 0;
        const rolled = start(times(parse(notation), many), [], die);
        if (best === undefined) return result(rolled).total;
        if (Math.abs(best) < 1) return 0;
        return keep(rolled.dice, Math.abs(best), best > 0 ? 'best' : 'worst', 'main').reduce((sum, d) => sum + d.value, 0);
      },
    } : {}),
    peak: (notation: string, many: number) => {
      if (Math.floor(many) < 1) return 0;
      return result(start(times(parse(notation), many), [], sides => sides)).total;
    },
  };
}
