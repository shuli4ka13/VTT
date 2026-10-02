import { editStages } from '../core/dice.ts';
import type { RollEditOp } from '../model/types.ts';

const LABELS: Record<string, string> = {
  addDie: 'добавить кость',
  bonusDie: 'добавить кость сверх',
  floorDie: 'считать не меньше',
  keepBest: 'оставить лучшую',
  keepWorst: 'оставить худшую',
  dieStep: 'сменить величину кости',
  shiftVersus: 'сдвинуть порог',
  shiftDegree: 'сдвинуть степень успеха',
  explode: 'взрывать кости',
  flip: 'перевернуть цифры',
  reroll: 'перебросить кости',
};

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
  editStages().map(({ op, stage }) => ({ op, label: LABELS[op] ?? op, stage }));
