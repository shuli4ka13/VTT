import { EngineError } from '../errors.ts';
import { result, see } from '../../core/dice.ts';
import type { SeenOp } from '../../core/dice.ts';
import type { StepContext, StepResult } from './index.ts';
import { tr } from '../../words/tongue.ts';

const who = (ctx: StepContext): string => ctx.owner || tr`правило`;

export function operate(ctx: StepContext, label: string, op: SeenOp): StepResult {
  const cell = ctx.seenRoll;
  if (!cell) throw new EngineError(tr`${who(ctx)}: «${label}» работает только в подписке «увидев кости»`);
  const before = result(cell.value).total + (cell.bonus ?? 0);
  cell.value = see(cell.value, op, ctx.die);
  const after = result(cell.value);
  const total = after.total + (cell.bonus ?? 0);
  return {
    value: { total, rolls: after.dice.rolls },
    trace: { op: op.kind, before, after: total, rolls: after.dice.rolls, ...(op.kind === 'plus' ? { addend: op.addend } : {}) },
    break: null,
  };
}

