import { EngineError } from '../errors.ts';
import { dieConstant } from '../lead-die.ts';
import { parse } from '../../core/dice.ts';
import type { Spec } from '../../core/dice.ts';
import type { StepContext } from './index.ts';

export function diceOf(ref: unknown, ctx: StepContext): Spec | null {
  if (!ref) return null;
  if (typeof ref === 'object' && ref !== null && 'constant' in ref) {
    const name = String((ref as { constant: unknown }).constant);
    const spec = parse(dieConstant(ctx.system, name));
    if (spec.terms.length !== 1) throw new EngineError(`«${spec.label || name}» — составная кость, её бросает проверка, а числом её не записать`);
    return spec;
  }
  const text = ctx.value(ref);
  return text === null || text === undefined || text === '' ? null : parse(String(text));
}
