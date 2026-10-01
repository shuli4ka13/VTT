import { EngineError } from './errors.ts';
import { readingOf } from './readings.ts';
import type { ReadSpec, RolledDie } from './readings.ts';
import type { DieConstant, DiceTerm, RollEdit, RollEditOp, Die } from '../model/types.ts';

export interface KeepSpec { n: number; from: 'best' | 'worst'; part?: string; unnamed?: boolean }

export interface RollClaim {
  dice: DiceTerm[];
  read: ReadSpec;

  keeps: KeepSpec[];

  versusShift: number;

  degreeShift: number;
}

interface ClaimPrimitive {
  stage: 'claim';
  label: string;
  apply(claim: RollClaim, op: RollEditOp): RollClaim;
}

interface ResultPrimitive {
  stage: 'result';
  label: string;
  apply(dice: RolledDie[], op: RollEditOp, die: Die): RolledDie[];
}

const num = (raw: unknown, fallback: number) => {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

const LADDER = [4, 6, 8, 10, 12, 20];

const partOf = (op: RollEditOp) => (op.part ? String(op.part) : undefined);

const inPart = (name: string | undefined, part?: string) => (part ? name === part : true);

const mainOf = (entry: RolledDie, part?: string) => inPart(entry.name, part) && (Boolean(part) || !entry.bonus);

const PRIMITIVES: Record<string, ClaimPrimitive | ResultPrimitive> = {

  addDie: {
    stage: 'claim',
    label: 'добавить кость',
    apply(claim, op) {
      const count = num(op.count, 1);
      const part = partOf(op);
      const first = claim.dice[0];
      if (!first) throw new EngineError('«добавить кость» нечего добавлять: в броске нет костей');

      if (part) {
        const at = claim.dice.findIndex(d => d.name === part);
        if (at < 0) {
          throw new EngineError(
            `правка адресована части «${part}», а в этом броске такой части нет`);
        }
        return {
          ...claim,
          dice: claim.dice.map((d, i) => (i === at ? { ...d, count: num(d.count, 1) + count } : d)),
        };
      }

      const sides = num(op.sides, first.sides);

      const at = claim.dice.findIndex(d => d.sides === sides && !d.name);
      if (at < 0) return { ...claim, dice: [...claim.dice, { count, sides }] };
      const dice = claim.dice.map((d, i) =>
        i === at ? { ...d, count: num(d.count, 1) + count } : d);
      return { ...claim, dice };
    },
  },

  bonusDie: {
    stage: 'claim',
    label: 'добавить кость сверх',
    apply(claim, op) {
      const first = claim.dice[0];
      if (!first) throw new EngineError('«добавить кость сверх» нечего добавлять: в броске нет костей');
      const count = num(op.count, 1);
      const sides = num(op.sides, first.sides);
      return { ...claim, dice: [...claim.dice, { count, sides, bonus: true, ...(op.minus ? { minus: true } : {}) }] };
    },
  },

  floorDie: {
    stage: 'result',
    label: 'считать не меньше',
    apply(dice, op) {
      const least = num(op.least, 10);
      const part = partOf(op);
      return dice.map(entry => {
        if (!mainOf(entry, part)) return entry;
        return entry.value >= least ? entry : { ...entry, value: least };
      });
    },
  },

  keepBest: {
    stage: 'claim',
    label: 'оставить лучшую',
    apply: (claim, op) => ({
      ...claim,
      keeps: [...claim.keeps, { n: num(op.n, 1), from: 'best', part: partOf(op) }],
    }),
  },

  keepWorst: {
    stage: 'claim',
    label: 'оставить худшую',
    apply: (claim, op) => ({
      ...claim,
      keeps: [...claim.keeps, { n: num(op.n, 1), from: 'worst', part: partOf(op) }],
    }),
  },

  dieStep: {
    stage: 'claim',
    label: 'сменить величину кости',
    apply(claim, op) {
      const by = num(op.by, 1);
      const part = partOf(op);
      const ladder = Array.isArray(op.ladder) ? (op.ladder as number[]) : LADDER;
      const dice = claim.dice.map(d => {
        if (!inPart(d.name, part)) return d;
        const at = ladder.indexOf(d.sides);

        if (at < 0) return d;
        const next = Math.min(ladder.length - 1, Math.max(0, at + by));
        return { ...d, sides: ladder[next]! };
      });
      return { ...claim, dice };
    },
  },

  shiftVersus: {
    stage: 'claim',
    label: 'сдвинуть порог',
    apply: (claim, op) => ({ ...claim, versusShift: claim.versusShift + num(op.by, 0) }),
  },

  shiftDegree: {
    stage: 'claim',
    label: 'сдвинуть степень успеха',
    apply: (claim, op) => ({ ...claim, degreeShift: claim.degreeShift + num(op.by, 0) }),
  },

  explode: {
    stage: 'result',
    label: 'взрывать кости',
    apply(dice, op, die) {
      const limit = num(op.limit, 10);
      const down = String(op.at ?? 'max') === 'min';
      const part = partOf(op);
      if (op.apart) {
        const out = [...dice];
        let guard = 0;
        for (let at = 0; at < out.length && guard < limit * Math.max(1, dice.length); at += 1) {
          const entry = out[at]!;
          if (!mainOf(entry, part) || entry.value !== entry.sides) continue;
          out.push({ ...entry, value: die(entry.sides) });
          guard += 1;
        }
        return out;
      }
      return dice.map(entry => {
        if (!mainOf(entry, part)) return entry;
        const trigger = down ? 1 : entry.sides;
        if (entry.value !== trigger) return entry;
        let value = entry.value;
        let extra = entry.value;
        let guard = 0;
        while (extra === trigger && guard++ < limit) {
          extra = die(entry.sides);
          value += down ? -extra : extra;
        }
        return { ...entry, value };
      });
    },
  },

  flip: {
    stage: 'result',
    label: 'перевернуть цифры',
    apply(dice, op) {
      const low = String(op.prefer ?? 'low') !== 'high';
      const part = partOf(op);
      return dice.map(entry => {
        if (!mainOf(entry, part)) return entry;
        const flipped = flipDigits(entry.value, entry.sides);
        if (flipped === null) return entry;
        const value = low ? Math.min(entry.value, flipped) : Math.max(entry.value, flipped);
        return value === entry.value ? entry : { ...entry, value };
      });
    },
  },
};

const rerollPrimitive: ResultPrimitive = {
  stage: 'result',
  label: 'перебросить кости',
  apply(dice, op, die) {
    const limit = num(op.n, 1);
    const part = partOf(op);
    return dice.map(entry => {
      if (!mainOf(entry, part)) return entry;
      if (entry.value > limit) return entry;
      return { ...entry, value: die(entry.sides), rerolled: true };
    });
  },
};
PRIMITIVES.reroll = rerollPrimitive;

function flipDigits(value: number, sides: number): number | null {
  const width = String(sides - 1).length;
  if (width < 2 || 10 ** width !== sides) return null;
  const digits = String(value % sides).padStart(width, '0');
  const flipped = Number([...digits].reverse().join(''));
  return flipped === 0 ? sides : flipped;
}

export const editPalette = (): { key: string; label: string; op: RollEditOp }[] => [
  { key: 'addDie', label: 'добавить кость', op: { op: 'addDie' } },
  { key: 'bonusDie', label: 'добавить кость сверх — её не отбрасывают', op: { op: 'bonusDie', sides: 4 } },
  { key: 'penaltyDie', label: 'вычесть кость сверх', op: { op: 'bonusDie', sides: 4, minus: true } },
  { key: 'floorDie', label: 'считать не меньше…', op: { op: 'floorDie', least: 10 } },
  { key: 'keepBest', label: 'оставить лучшую', op: { op: 'keepBest', n: 1 } },
  { key: 'keepWorst', label: 'оставить худшую', op: { op: 'keepWorst', n: 1 } },
  { key: 'dieStep', label: 'сменить величину кости', op: { op: 'dieStep', by: 1 } },
  { key: 'shiftVersus', label: 'сдвинуть порог', op: { op: 'shiftVersus', by: -2 } },
  { key: 'shiftDegree', label: 'сдвинуть степень успеха', op: { op: 'shiftDegree', by: 1 } },
  { key: 'explodeUp', label: 'взрывать на максимуме', op: { op: 'explode' } },
  { key: 'explodeDown', label: 'взрывать на единице', op: { op: 'explode', at: 'min' } },
  { key: 'explodeApart', label: 'подрыв: на максимуме — ещё одна кость отдельно', op: { op: 'explode', apart: true } },
  { key: 'flipLow', label: 'перевернуть цифры в меньшую', op: { op: 'flip', prefer: 'low' } },
  { key: 'flipHigh', label: 'перевернуть цифры в большую', op: { op: 'flip', prefer: 'high' } },
  { key: 'rerollLow', label: 'перебросить кости не выше…', op: { op: 'reroll', n: 1 } },
];

export const paletteKeyOf = (op: RollEditOp): string =>
  op.op === 'bonusDie' && op.minus ? 'penaltyDie'
    : op.op === 'explode' ? (op.apart ? 'explodeApart' : String(op.at ?? 'max') === 'min' ? 'explodeDown' : 'explodeUp')
    : op.op === 'flip' ? (String(op.prefer ?? 'low') === 'high' ? 'flipHigh' : 'flipLow')
      : op.op === 'reroll' ? 'rerollLow'
        : String(op.op);

export const editPrimitives = () =>
  Object.entries(PRIMITIVES).map(([op, p]) => ({ op, label: p.label, stage: p.stage }));

function primitiveOf(op: RollEditOp) {
  const found = PRIMITIVES[String(op.op)];
  if (!found) {
    throw new EngineError(
      `неизвестная правка броска «${op.op}»; есть: ${Object.keys(PRIMITIVES).join(', ')}`);
  }
  return found;
}

export function claimOf(def: DieConstant): RollClaim {
  return {
    dice: def.dice || [], read: readingOf(def.read),
    keeps: [], versusShift: 0, degreeShift: 0,
  };
}

export function applyClaimEdits(claim: RollClaim, edits: RollEdit[]): RollClaim {
  let next = claim;
  for (const edit of edits) {
    for (const op of edit.ops || []) {
      const primitive = primitiveOf(op);
      if (primitive.stage === 'claim') next = primitive.apply(next, op);
    }
  }
  return next;
}

export function applyResultEdits(dice: RolledDie[], edits: RollEdit[], die: Die): RolledDie[] {
  let next = dice;
  for (const edit of edits) {
    for (const op of edit.ops || []) {
      const primitive = primitiveOf(op);
      if (primitive.stage === 'result') next = primitive.apply(next, op, die);
    }
  }
  return next;
}

export function keptDice(dice: RolledDie[], keeps: KeepSpec[]): RolledDie[] {
  let out = dice.filter(d => !d.dropped);
  for (const keep of keeps) {

    const mine = (keep.part ? out.filter(d => d.name === keep.part) : keep.unnamed ? out.filter(d => !d.name) : out).filter(d => !d.bonus);
    const chosen = new Set([...mine]
      .sort((a, b) => (keep.from === 'best' ? b.value - a.value : a.value - b.value))
      .slice(0, Math.max(1, keep.n)));

    out = out.filter(d => !mine.includes(d) || chosen.has(d));
  }
  return out;
}
