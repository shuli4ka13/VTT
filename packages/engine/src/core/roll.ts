import { rollEdits } from './edits.ts';
import type { Held } from './edits.ts';
import { parse, times, start, result, addTo } from './dice.ts';
import type { Roll, RollResult, Spec } from './dice.ts';
import type { Pass } from '../engine/calc.ts';
import type { Tools } from '../formula/index.ts';
import type { Die } from '../model/types.ts';
import type { Thrower } from './against.ts';

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
  thrower?: Thrower;
}

export function throwDice(t: Throw): Thrown {
  const { edits, addends, canceled, words } = rollEdits(t.held, t.claims, t.roller, t.tags);
  const dictionary = t.roller.system.roll_edits ?? {};
  const gone = [...new Set(canceled)].map(key => dictionary[key]?.label || key);
  const started = { ...start(t.spec, edits, t.die, t.tags), words: [...new Set(words)] };
  const thrown = addTo(gone.length ? { ...started, canceled: gone } : started, addends, t.die);
  const roll = t.seen ? t.seen(thrown) : thrown;
  return { roll, result: result(roll) };
}

export function diceTools(): Pick<Tools, 'peak'> {
  return {
    peak: (notation: string, many: number) => {
      if (Math.floor(many) < 1) return 0;
      return result(start(times(parse(notation), many), [], sides => sides)).total;
    },
  };
}
