import { stepModule } from './steps/index.ts';
import { findField } from './calc.ts';
import { requireEffect, stackingOf, usesMax } from './effects.ts';
import { packRef, resolveRef } from './refs.ts';
import { EngineError } from './errors.ts';
import type { StepContext, StepData } from './steps/index.ts';
import type { Effect, Sheet, Step, WornEffect, StoredValue } from '../model/types.ts';

export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string }

export interface EmittedEvent { event: string; amount: number; incoming: number; tags: string[] }

export interface RuleReport {
  sheet: Sheet;
  changes: Change[];

  effects: string[];
  removed: string[];
  results: Record<string, unknown>;
  trace: Record<string, unknown>[];
  stopped: StopReason | null;

  emitted: EmittedEvent[];
}

export interface NestedRun { results: Record<string, unknown>; stopped: StopReason | null }

export const MAX_CALL_DEPTH = 8;

const packGuard = (guard: unknown, ctx: StepContext): unknown => {
  if (guard === null || guard === undefined) return undefined;
  if (typeof guard === 'object' && 'ref' in (guard as object)) return guard;
  return packRef(guard, ctx);
};

export function packSteps(steps: Step[], ctx: StepContext): StepData[] {
  const packed: StepData[] = [];
  for (const step of steps) {
    const mod = stepModule(step.type);
    const when = packGuard((step as StepData).when, ctx);
    packed.push({
      type: step.type, id: step.id ?? null,
      ...(when !== undefined ? { when } : {}),
      ...mod.pack(step as StepData, ctx),
    } as StepData);
  }
  return packed;
}

export function packRule(rule: Effect, ctx: StepContext): StepData[] {
  return packSteps(rule.steps || [], { ...ctx, paramDefs: rule.params || [] });
}

export function guardHolds(guard: unknown, ctx: StepContext): boolean {
  if (guard === null || guard === undefined) return true;
  const g = guard as Record<string, unknown>;
  if ('const' in g) return Boolean(g.const);
  if ('ref' in g) {
    const value = resolveRef({ ref: g.ref }, ctx);
    let holds: boolean;
    if (g.is !== undefined) holds = value === g.is;
    else if (g.atLeast !== undefined || g.atMost !== undefined) {
      if (typeof value !== 'number') {
        throw new EngineError(
          `${who(ctx)}: условие шага «${g.ref}» сравнивает с числом, а там ${JSON.stringify(value)}`);
      }
      holds = (g.atLeast === undefined || value >= Number(g.atLeast)) && (g.atMost === undefined || value <= Number(g.atMost));
    } else if (g.has !== undefined) {
      holds = Array.isArray(value) ? value.map(String).includes(String(g.has)) : String(value ?? '') === String(g.has);
    } else if (typeof value === 'boolean') holds = value;
    else {
      throw new EngineError(
        `${who(ctx)}: условие шага «${g.ref}» должно давать да/нет, а дало ${JSON.stringify(value)}`);
    }
    return g.not ? !holds : holds;
  }
  const value = resolveRef(g, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(`${who(ctx)}: условие шага должно давать да/нет, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

export function resolveRule(steps: StepData[], ctx: StepContext): RuleReport {

  const values: Record<string, StoredValue> = { ...ctx.sheet.values };
  const worn: WornEffect[] = [...(ctx.sheet.effects || [])];
  const changes: Change[] = [];
  const effects: string[] = [];
  const removed: string[] = [];
  const emitted: EmittedEvent[] = [];
  const trace: Record<string, unknown>[] = [];

  const read = (tag: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(values, tag)) return values[tag];
    const field = findField(ctx.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
    return field.value.kind === 'stored' ? field.value.default : undefined;
  };

  const write = (tag: string, to: StoredValue): void => {
    changes.push({ tag, from: read(tag), to });
    values[tag] = to;
  };

  const attach = (effectId: string): void => {
    const effect = requireEffect(ctx.system, effectId, who(ctx));
    const at = worn.findIndex(e => e.effectId === effectId);
    const fresh: WornEffect = { effectId, ...(ctx.expiry ? ctx.expiry(effect) : {}) };
    const max = usesMax(effect);
    if (max !== null) fresh.usesLeft = max;

    if (at < 0) worn.push(fresh);
    else if (stackingOf(effect) === 'refresh') worn[at] = fresh;
    else if (stackingOf(effect) === 'stack') worn.push(fresh);
    else return;

    if (!effects.includes(effectId)) effects.push(effectId);
  };

  const detach = (effectId: string): void => {
    requireEffect(ctx.system, effectId, who(ctx));
    const before = worn.length;
    for (let i = worn.length - 1; i >= 0; i--) {
      if (worn[i]!.effectId === effectId) worn.splice(i, 1);
    }
    if (worn.length !== before) removed.push(effectId);
  };

  const emit = (event: EmittedEvent): void => { emitted.push(event); };

  function runSteps(list: StepData[], results: Record<string, unknown>, within?: string): NestedRun {
    let stopped: StopReason | null = null;
    const stepCtx: StepContext = { ...ctx, results, read, write, attach, detach, emit, run };

    for (const [index, step] of list.entries()) {
      const mod = stepModule(step.type);
      const name = step.id ?? index;
      const mark = within ? { within } : {};
      if (!guardHolds(step.when, stepCtx)) {
        trace.push({ step: name, type: step.type, skipped: true, ...mark });
        continue;
      }
      const at = trace.length;
      const out = mod.resolve(step, stepCtx);
      trace.splice(at, 0, { step: name, type: step.type, ...mark, ...out.trace });
      if (step.id != null) results[step.id] = out.value;
      if (out.break) {
        stopped = { step: name, type: step.type, reason: out.break.reason };
        break;
      }
    }
    return { results, stopped };
  }

  const chain: string[] = [];
  const run = (list: Step[], seed: Record<string, unknown>, within?: string): NestedRun => {
    if (within) {
      if (chain.length >= MAX_CALL_DEPTH) {
        throw new EngineError(
          `${who(ctx)}: вызовы вложены глубже ${MAX_CALL_DEPTH} — похоже, идут по кругу: ${[...chain, within].join(' → ')}`);
      }
      chain.push(within);
    }
    try {
      const packed = packSteps(list, { ...ctx, results: seed });
      return runSteps(packed, seed, within);
    } finally {
      if (within) chain.pop();
    }
  };

  const results: Record<string, unknown> = { ...(ctx.results ?? {}) };
  const { stopped } = runSteps(steps, results);

  const touched = changes.length || effects.length || removed.length;
  const sheet = touched ? { ...ctx.sheet, values, effects: worn } : ctx.sheet;
  return { sheet, changes, effects, removed, results, trace, stopped, emitted };
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';
