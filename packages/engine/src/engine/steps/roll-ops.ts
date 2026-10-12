import { EngineError } from '../errors.ts';
import { result, see } from '../../core/dice.ts';
import type { SeenOp } from '../../core/dice.ts';
import type { StepContext, StepResult } from './index.ts';

const who = (ctx: StepContext): string => ctx.owner || 'правило';

export function operate(ctx: StepContext, label: string, op: SeenOp): StepResult {
  const cell = ctx.seenRoll;
  if (!cell) throw new EngineError(`${who(ctx)}: «${label}» работает только в подписке «увидев кости»`);
  const before = result(cell.value).total;
  cell.value = see(cell.value, op, ctx.die);
  const after = result(cell.value);
  return {
    value: { total: after.total, rolls: after.dice.rolls },
    trace: { op: op.kind, before, after: after.total, rolls: after.dice.rolls, ...(op.kind === 'plus' ? { addend: op.addend } : {}) },
    break: null,
  };
}

