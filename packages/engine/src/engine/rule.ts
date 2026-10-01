import { packRef, resolveRef } from './refs.ts';
import { EngineError } from './errors.ts';
import type { StepContext } from './steps/index.ts';

export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string; note?: string }

export interface EmittedEvent { event: string; amount: number; incoming: number; tags: string[] }

export interface NestedRun { results: Record<string, unknown>; stopped: StopReason | null }

export const MAX_CALL_DEPTH = 8;

export const packGuardRef = (guard: unknown, ctx: StepContext): unknown =>
  (guard === null || guard === undefined ? undefined : packRef(guard, ctx));

export function guardHolds(guard: unknown, ctx: StepContext): boolean {
  if (guard === null || guard === undefined) return true;
  const g = guard as Record<string, unknown>;
  const packed = 'expr' in g && !g.later && !g.of ? packRef(g, ctx) : g;
  const value = resolveRef(packed, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(`${who(ctx)}: условие шага должно давать да/нет, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';
