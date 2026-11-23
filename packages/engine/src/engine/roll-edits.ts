import { editStages } from '../core/dice.ts';
import type { RollEditOp } from '../model/types.ts';

const LABELS: Record<string, string> = {
  addDie: 'добавить кость',
  plus: 'прибавить к итогу',
  floorDie: 'считать не меньше',
  keepBest: 'оставить лучшую',
  keepWorst: 'оставить худшую',
  dieStep: 'сменить величину кости',
  shiftVersus: 'сдвинуть порог',
  shiftDegree: 'сдвинуть степень успеха',
  explode: 'взрывать кости',
  flip: 'перевернуть цифры',
  reroll: 'перебросить кости',
  wild: 'дикий кубик',
};

export const editPalette = (): { key: string; label: string; op: RollEditOp }[] => [
  { key: 'addDie', label: 'добавить кость в набор', op: { op: 'addDie' } },
  { key: 'wild', label: 'дикий кубик: 5–6 — три успеха, 1 гасит пятёрки', op: { op: 'wild' } },
  { key: 'plus', label: 'прибавить к итогу…', op: { op: 'plus', die: '1d6' } },
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
  op.op === 'explode' ? (op.apart ? 'explodeApart' : String(op.at ?? 'max') === 'min' ? 'explodeDown' : 'explodeUp')
    : op.op === 'flip' ? (String(op.prefer ?? 'low') === 'high' ? 'flipHigh' : 'flipLow')
      : op.op === 'reroll' ? 'rerollLow'
        : String(op.op);

export const editPrimitives = () =>
  editStages().map(({ op, stage }) => ({ op, label: LABELS[op] ?? op, stage }));
