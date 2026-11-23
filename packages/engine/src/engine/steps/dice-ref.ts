import { EngineError } from '../errors.ts';
import { dieConstant } from '../lead-die.ts';
import { parse } from '../../core/dice.ts';
import type { Spec } from '../../core/dice.ts';
import type { StepContext } from './index.ts';
import { tr } from '../../words/tongue.ts';

export function diceOf(ref: unknown, ctx: StepContext): Spec | null {
  if (!ref) return null;
  if (typeof ref === 'string') {
    const name = ref;
    const spec = parse(dieConstant(ctx.system, name));
    if (spec.terms.length !== 1) throw new EngineError(tr`«${spec.label || name}» — составная кость, её бросает проверка, а числом её не записать`);
    return spec;
  }
  const text = ctx.value(ref);
  return text === null || text === undefined || text === '' ? null : parse(String(text));
}
