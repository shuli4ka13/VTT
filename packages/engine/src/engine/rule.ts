import { whoseOf } from '../events/durations.ts';
import { stepModule } from './steps/index.ts';
import { rolledSoFar } from './rolled.ts';
import { findField, holderIdOf, livesOn } from './calc.ts';
import { requireEffect, reapplyOf, usesMax } from './effects.ts';
import { packRef, resolveRef } from './refs.ts';
import { EngineError } from './errors.ts';
import type { StepContext, StepData } from './steps/index.ts';
import type { Effect, Sheet, Step, WornEffect, StoredValue, Param } from '../model/types.ts';

export interface Change { tag: string; from: unknown; to: unknown }

export interface StopReason { step: string | number; type: string; reason?: string; note?: string }

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

  shared?: Sheet[];

  answers?: { event: string; args: Record<string, unknown> }[];
}

export interface NestedRun { results: Record<string, unknown>; stopped: StopReason | null }

export const MAX_CALL_DEPTH = 8;

export const packGuardRef = (guard: unknown, ctx: StepContext): unknown =>
  (guard === null || guard === undefined ? undefined : packRef(guard, ctx));

export function packSteps(steps: Step[], ctx: StepContext): StepData[] {
  const packed: StepData[] = [];
  const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
  for (const step of steps) {
    const mod = stepModule(step.type);
    const sender = rolledSoFar(packed as unknown as Record<string, unknown>[]);
    const inner = { ...ctx, sender, stepIds };
    const when = packGuardRef((step as StepData).when, inner);
    packed.push({
      type: step.type, id: step.id ?? null,
      ...(when !== undefined ? { when } : {}),
      ...mod.pack(step as StepData, inner),
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
  const packed = 'expr' in g && !g.later && !g.of ? packRef(g, ctx) : g;
  const value = resolveRef(packed, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(`${who(ctx)}: условие шага должно давать да/нет, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

export function resolveRule(steps: StepData[], ctx: StepContext): RuleReport {

  const values: Record<string, StoredValue> = { ...ctx.sheet.values };
  const holders = new Map<string, Record<string, StoredValue>>();
  const touchedHolders = new Set<string>();
  const holderOf = (tag: string): Record<string, StoredValue> | null => {
    const field = findField(ctx.system, tag);
    const id = holderIdOf(field, ctx.sheet);
    if (!id || id === ctx.sheet.id) return null;
    if (holders.has(id)) return holders.get(id)!;
    const sheet = (ctx.shared ?? []).find(s => s.id === id);
    if (!sheet) {
      if (livesOn(field) === 'group') return null;
      throw new EngineError(`${who(ctx)}: поле «${tag}» лежит на столе, а стола здесь нет`);
    }
    const copy = { ...sheet.values };
    holders.set(id, copy);
    return copy;
  };
  const worn: WornEffect[] = [...(ctx.sheet.effects || [])];
  const changes: Change[] = [];
  const effects: string[] = [];
  const removed: string[] = [];
  const emitted: EmittedEvent[] = [];
  const trace: Record<string, unknown>[] = [];

  const read = (tag: string): unknown => {
    const held = holderOf(tag);
    if (held) {
      if (Object.prototype.hasOwnProperty.call(held, tag)) return held[tag];
      const field = findField(ctx.system, tag)!;
      return field.value.kind === 'stored' ? field.value.default : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(values, tag)) return values[tag];
    const field = findField(ctx.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
    return field.value.kind === 'stored' ? field.value.default : undefined;
  };

  const write = (tag: string, to: StoredValue): void => {
    const from = read(tag);
    if (Object.is(from, to)) return;
    changes.push({ tag, from, to });
    const held = holderOf(tag);
    if (held) {
      held[tag] = to;
      touchedHolders.add(holderIdOf(findField(ctx.system, tag), ctx.sheet)!);
      return;
    }
    values[tag] = to;
  };

  const attach = (effectId: string, extra?: Record<string, number>): void => {
    const effect = requireEffect(ctx.system, effectId, who(ctx));
    const at = worn.findIndex(e => e.effectId === effectId);
    const fresh: WornEffect = {
      effectId,
      ...(extra ?? {}),
      ...(ctx.expiry ? ctx.expiry(effect) : {}),
      ...(whoseOf(effect) === 'source' && ctx.source ? { from: ctx.source } : {}),
      ...(ctx.bond ? { from: ctx.bond.from, by: ctx.bond.by } : {}),
    };
    const max = usesMax(effect);
    if (max !== null) fresh.usesLeft = max;

    if (at < 0) worn.push(fresh);
    else if (reapplyOf(effect) === 'refresh') worn[at] = fresh;
    else if (reapplyOf(effect) === 'stack') worn.push(fresh);
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
  const answers: { event: string; args: Record<string, unknown> }[] = [];
  const answer = (call: { event: string; args: Record<string, unknown> }): void => { answers.push(call); };

  function runSteps(list: StepData[], results: Record<string, unknown>, within?: string): NestedRun {
    let stopped: StopReason | null = null;
    const stepCtx: StepContext = { ...ctx, results, read, write, attach, detach, emit, run, answer };

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
        stopped = { step: name, type: step.type, reason: out.break.reason, ...(out.break.note ? { note: out.break.note } : {}) };
        break;
      }
    }
    return { results, stopped };
  }

  const chain: string[] = [];
  const run = (
    list: Step[], seed: Record<string, unknown>, within?: string,
    params?: Record<string, unknown>, paramDefs?: Param[],
  ): NestedRun => {
    if (within) {
      if (chain.length >= MAX_CALL_DEPTH) {
        throw new EngineError(
          `${who(ctx)}: вызовы вложены глубже ${MAX_CALL_DEPTH} — похоже, идут по кругу: ${[...chain, within].join(' → ')}`);
      }
      chain.push(within);
    }
    try {
      const packed = packSteps(list, {
        ...ctx, results: seed, atReceiver: true,
        ...(params ? { params } : {}),
        ...(paramDefs ? { paramDefs } : {}),
      });
      return runSteps(packed, seed, within);
    } finally {
      if (within) chain.pop();
    }
  };

  const results: Record<string, unknown> = { ...(ctx.results ?? {}) };
  const { stopped } = runSteps(steps, results);

  const touched = changes.length || effects.length || removed.length;
  const sheet = touched ? { ...ctx.sheet, values, effects: worn } : ctx.sheet;
  return {
    sheet, changes, effects, removed, results, trace, stopped, emitted,
    ...(touchedHolders.size ? {
      shared: [...touchedHolders].map(id => {
        const sheet = (ctx.shared ?? []).find(s => s.id === id)!;
        return { ...sheet, values: holders.get(id)! };
      }),
    } : {}),
    ...(answers.length ? { answers } : {}),
  };
}

const who = (ctx: StepContext): string => ctx.owner || 'правило';
