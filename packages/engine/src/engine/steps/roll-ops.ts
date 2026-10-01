import { packRef, resolveNumber, resolveOptionalNumber } from '../refs.ts';
import { seeRoll } from '../lead-die.ts';
import type { SeenOp, LeadRoll } from '../lead-die.ts';
import { EngineError } from '../errors.ts';
import type { StepData, StepContext } from './index.ts';

export interface SeenCell { value: LeadRoll }

const cellOf = (ctx: StepContext, label: string): SeenCell => {
  const cell = ctx.seenRoll as SeenCell | undefined;
  if (!cell) throw new EngineError(`${ctx.owner || 'правило'}: «${label}» работает только в подписке «увидев кости»`);
  return cell;
};

export const packed = (keys: readonly string[]) => (step: StepData, ctx: StepContext): Record<string, unknown> =>
  Object.fromEntries(keys.filter(key => step[key] !== undefined && step[key] !== null && step[key] !== '')
    .map(key => [key, key === 'keep' ? step[key] : packRef(step[key], ctx)]));

export function operate(ctx: StepContext, label: string, op: SeenOp) {
  const cell = cellOf(ctx, label);
  const before = cell.value.total;
  cell.value = seeRoll(cell.value, op, ctx.die);
  return {
    value: { total: cell.value.total, rolls: cell.value.rolls },
    trace: { op: op.kind, before, after: cell.value.total, rolls: cell.value.rolls },
    break: null,
  };
}

export const numberOf = (ref: unknown, ctx: StepContext, what: string): number => resolveNumber(ref, ctx, what);
export const optionalNumber = (ref: unknown, ctx: StepContext, what: string): number | null => resolveOptionalNumber(ref, ctx, what);
