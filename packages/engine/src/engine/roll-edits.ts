import { editStages } from '../core/dice.ts';
import type { RollEditOp } from '../model/types.ts';
import { tr, live } from '../words/tongue.ts';

const LABELS: Record<string, string> = live({
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
});

export const editPalette = (): { key: string; label: string; op: RollEditOp }[] => [
  { key: 'addDie', label: tr`добавить кость в набор`, op: { op: 'addDie' } },
  { key: 'wild', label: tr`дикий кубик: 5–6 — три успеха, 1 гасит пятёрки`, op: { op: 'wild' } },
  { key: 'plus', label: tr`прибавить к итогу…`, op: { op: 'plus', die: '1d6' } },
  { key: 'floorDie', label: tr`считать не меньше…`, op: { op: 'floorDie', least: 10 } },
  { key: 'keepBest', label: tr`оставить лучшую`, op: { op: 'keepBest', n: 1 } },
  { key: 'keepWorst', label: tr`оставить худшую`, op: { op: 'keepWorst', n: 1 } },
  { key: 'dieStep', label: tr`сменить величину кости`, op: { op: 'dieStep', by: 1 } },
  { key: 'shiftVersus', label: tr`сдвинуть порог`, op: { op: 'shiftVersus', by: -2 } },
  { key: 'shiftDegree', label: tr`сдвинуть степень успеха`, op: { op: 'shiftDegree', by: 1 } },
  { key: 'explodeUp', label: tr`взрывать на максимуме`, op: { op: 'explode' } },
  { key: 'explodeDown', label: tr`взрывать на единице`, op: { op: 'explode', at: 'min' } },
  { key: 'explodeApart', label: tr`подрыв: на максимуме — ещё одна кость отдельно`, op: { op: 'explode', apart: true } },
  { key: 'flipLow', label: tr`перевернуть цифры в меньшую`, op: { op: 'flip', prefer: 'low' } },
  { key: 'flipHigh', label: tr`перевернуть цифры в большую`, op: { op: 'flip', prefer: 'high' } },
  { key: 'rerollLow', label: tr`перебросить кости не выше…`, op: { op: 'reroll', n: 1 } },
];

export const paletteKeyOf = (op: RollEditOp): string =>
  op.op === 'explode' ? (op.apart ? 'explodeApart' : String(op.at ?? 'max') === 'min' ? 'explodeDown' : 'explodeUp')
    : op.op === 'flip' ? (String(op.prefer ?? 'low') === 'high' ? 'flipHigh' : 'flipLow')
      : op.op === 'reroll' ? 'rerollLow'
        : String(op.op);

export const editPrimitives = () =>
  editStages().map(({ op, stage }) => ({ op, label: LABELS[op] ?? op, stage }));
