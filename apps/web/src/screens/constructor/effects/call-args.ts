import type { System, Effect } from '@vtt/schema';
import { implicitOf, appliedOf } from '@vtt/engine/model/implicit';
import { paramsOf } from '@vtt/engine/model/inherit';

type Args = Record<string, unknown>;

export interface CallPlace {
  inLoop: boolean;
  to?: unknown;
  applied?: boolean;
}

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | null | undefined)?.expr ?? '').trim();

export function callArgs(system: System, caller: Pick<Effect, 'params' | 'steps' | 'activation'>, id: string, current: Args | undefined, place: CallPlace): Args {
  const called = system.effects?.[id];
  if (!called) return { ...(current ?? {}) };
  const out: Args = {};
  for (const param of paramsOf(system, called)) {
    if (current && param.key in current) { out[param.key] = current[param.key]; continue; }
    const how = place.applied ? appliedOf(param, caller) : implicitOf(param, caller);
    if (!how) continue;
    if (how.by === 'to') {
      const to = exprOf(place.to);
      if (to) out[param.key] = { expr: to };
      continue;
    }
    if (how.by === 'target' && !place.inLoop) continue;
    out[param.key] = { expr: `@${how.from}` };
  }
  return out;
}

export function retarget(system: System, caller: Pick<Effect, 'params' | 'steps' | 'activation'>, id: string, current: Args | undefined, before: unknown, after: unknown): Args {
  const out: Args = { ...(current ?? {}) };
  const called = system.effects?.[id];
  if (!called) return out;
  const was = exprOf(before);
  for (const param of paramsOf(system, called)) {
    if (appliedOf(param, caller)?.by !== 'to') continue;
    const here = exprOf(out[param.key]);
    if (here && here !== was) continue;
    const now = exprOf(after);
    if (now) out[param.key] = { expr: now }; else delete out[param.key];
  }
  return out;
}

export function filledStep(system: System, caller: Pick<Effect, 'params' | 'steps' | 'activation'>, step: Record<string, unknown>, earlier: readonly { type: string }[]): Record<string, unknown> {
  const id = typeof step.effect === 'string' ? step.effect : '';
  if (!id) return step;
  const args = callArgs(system, caller, id, step.args as Args | undefined, { inLoop: earlier.some(one => one.type === 'each'), to: step.to, applied: step.type === 'status' });
  return Object.keys(args).length ? { ...step, args } : step;
}
