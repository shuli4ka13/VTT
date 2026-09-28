import { answerSteps } from '../engine/steps/emit.ts';
import { newPass } from '../engine/calc.ts';
import { rolledSoFar } from '../engine/rolled.ts';
import { packCall, runCall } from './call.ts';
import { holdsNow } from '../engine/refs.ts';
import { burnsUse, spendUse } from './durations.ts';
export { spendUse } from './durations.ts';
import { findRecord, heldBy, isItem, kindOfRecord, entryOf, propsOf } from '../model/owned.ts';
export { propsOf } from '../model/owned.ts';
import { requireEffect, findEffect, isPipeline, grantedTo } from '../engine/effects.ts';
import { listening, subscriberByKey, hears, runsAtOther, withSteps } from './bus.ts';
import type { Role, Phase } from './bus.ts';
import { EngineError } from '../engine/errors.ts';
import { incomingRollModifiers } from '../engine/modifiers.ts';
import { holderOf } from './bonds.ts';
import { withShared, changedShared, isDesk } from './desk.ts';
import { refusalWords } from './refusal.ts';
import type { Clock } from '../engine/clock.ts';
import type {
  System, Sheet, Compendium, CompendiumRecord, Binding, Die, Effect,
} from '../model/types.ts';
import type { StepData } from '../engine/steps/index.ts';
import type { EmittedEvent } from '../engine/rule.ts';

export interface Action {
  id: string;
  label: string;
  record: CompendiumRecord;
  binding: Binding;
  effect: string;
}

export interface WorldContext {
  system: System;
  compendium: Compendium;
  die: Die;

  clock?: Clock | null;

  shared?: Sheet[] | null;
}

export interface Envelope {
  kind: string;
  effect: string;
  from: string;
  to?: string;
  action: string;
  label: string;
  steps: StepData[];

  reply?: boolean;
}

export interface Report {
  kind: string;
  effect: string;
  from: string;
  label: string;
  reply: boolean;
  trace: Record<string, unknown>[];
  stopped: unknown;
  changes: unknown[];
  effects: string[];
  removed: string[];
  spent: string[];

  emitted: EmittedEvent[];

  reactions?: Report[];
}

export interface ReceiveResult {
  sheet: Sheet;
  replies: Envelope[];
  report: Report;

  results: Record<string, unknown>;

  shared?: Sheet[];
}

export function bindingsOf(record: CompendiumRecord, system: System): Binding[] {
  if (record.bindings?.length) return record.bindings;
  return kindOfRecord(system, record)?.bindings ?? [];
}

export const GRANTED_ACTION = '+';

function grantedAction(id: string, system: System): Action | null {
  const effect = findEffect(system, id);
  if (!effect || !isPipeline(effect)) return null;
  const label = effect.label || id;
  return {
    id: `${GRANTED_ACTION}${id}`,
    label,
    record: { id: `${GRANTED_ACTION}${id}`, label, ...(effect.description ? { description: effect.description } : {}) },
    binding: { effect: id },
    effect: id,
  };
}

export function availableActions(
  sheet: Sheet, { system, compendium }: { system: System; compendium: Compendium },
): Action[] {
  const own = heldBy(sheet, compendium).flatMap(({ record }) => actionsOfRecord(record, system, isItem(system, record)));
  if (isDesk(sheet)) return own;
  const granted = grantedTo(system, sheet, compendium)
    .map(id => grantedAction(id, system))
    .filter((action): action is Action => action !== null && !own.some(o => o.effect === action.effect));
  return [...own, ...granted];
}

export function actionOf(
  actionId: string, { system, compendium }: { system: System; compendium: Compendium },
): Action {
  if (String(actionId).startsWith(GRANTED_ACTION)) {
    const id = String(actionId).slice(GRANTED_ACTION.length);
    const action = grantedAction(id, system);
    if (!action) throw new EngineError(`эффекта-кнопки «${id}» в системе нет`);
    return action;
  }
  const at = String(actionId).lastIndexOf(':');
  const recordId = at > 0 ? String(actionId).slice(0, at) : String(actionId);
  const index = at > 0 ? Number(String(actionId).slice(at + 1)) : 0;

  const record = findRecord(compendium, recordId);
  if (!record) throw new EngineError(`в компендиуме нет записи «${recordId}»`);

  const action = actionsOfRecord(record, system, isItem(system, record))[index];
  if (!action) {
    throw new EngineError(
      `запись «${record.label}» (${recordId}) не даёт действия №${index}: ` +
      'ни своей привязки, ни привязки у её рода');
  }
  return action;
}

function actionsOfRecord(record: CompendiumRecord, system: System, fromItem: boolean): Action[] {
  const bindings = bindingsOf(record, system);
  return bindings.map((binding, index): Action => ({
    id: `${record.id}:${index}`,
    label: fromItem || bindings.length > 1
      ? `${record.label} · ${binding.label || 'Применение'}`
      : String(record.label),
    record,
    binding,
    effect: binding.effect,
  }));
}

export interface SendOptions {
  inputs?: Record<string, number | string>;
  against?: Sheet | null;
  claims?: string[];

  kept?: StepData[];
}

export function send(
  actionId: string,
  { system, sheet, compendium, die, against, claims, inputs, kept, shared }: WorldContext & { sheet: Sheet } & SendOptions,
): Envelope {
  const action = actionOf(actionId, { system, compendium });

  const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
  if (!isPipeline(effect)) {
    throw new EngineError(
      `действие «${action.label}» зовёт эффект «${effect.label || action.effect}», ` +
      'а он пассивный: у пассивного конвейера шагов нет, его вешают, а не применяют');
  }

  const targetPass = against ? newPass(system, against, { compendium }) : null;
  const steps = packCall({
    effectId: action.effect, effect, sheet,
    args: action.binding.args || {},
    props: propsOf(action.record, system, entryOf(sheet, action.record.id)),
    owner: `эффект «${effect.label || action.effect}»`,
    ...(inputs ? { inputs } : {}),
    ...(targetPass ? { against: (tags: readonly string[]) => incomingRollModifiers(tags, targetPass) } : {}),
    ...(claims?.length ? { claims } : {}),
    ...(kept?.length ? { kept } : {}),
  }, { system, compendium, die, shared });

  return {
    kind: 'effect',
    effect: action.effect,
    from: sheet.id,
    action: action.id,
    label: action.label,
    steps,
  };
}

export function receive(
  envelope: Envelope,
  { system, sheet, compendium, die, claims, clock, shared }: WorldContext & { sheet: Sheet } & { claims?: string[] },
): ReceiveResult {
  const holder = findEffect(system, envelope.effect);
  const early: { sheet: Sheet; reactions: Report[]; spent: string[]; shared?: Sheet[] } = envelope.reply
    ? { sheet, reactions: [], spent: [] }
    : fireBefore(envelope, sheet, { system, compendium, die, clock, shared });
  const sharedBefore = withShared(shared ?? [], early.shared);
  const out = runCall(envelope.steps || [], {
    sheet: early.sheet, owner: `конверт «${envelope.label}»`, source: envelope.from,
    ...(claims?.length ? { claims } : {}),
    ...(holder?.bond ? { bond: { from: envelope.from, by: holderOf(envelope.effect, holder)! } } : {}),
  }, { system, compendium, die, clock, shared: sharedBefore });

  const sharedAfter = withShared(sharedBefore, out.shared);
  const fired: { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[]; shared?: Sheet[] } = envelope.reply
    ? { sheet: out.sheet, replies: [], spent: [], reactions: [] }
    : fireTriggers(envelope, out, { system, compendium, die, clock, shared: sharedAfter });
  const sharedChanged = changedShared(withShared(sharedAfter, fired.shared), shared);
  const reactions = [...early.reactions, ...fired.reactions];
  const answered: Envelope[] = (out.answers ?? []).map(call => ({
    kind: 'effect', effect: call.event, from: sheet.id, to: envelope.from, reply: true, action: call.event,
    label: system.effects[call.event]?.label || call.event,
    steps: answerSteps(call),
  }));

  return {
    sheet: fired.sheet,
    replies: [...answered, ...fired.replies],
    results: out.results,
    ...(sharedChanged.length ? { shared: sharedChanged } : {}),
    report: {
      kind: envelope.kind,
      effect: envelope.effect,
      from: envelope.from,
      label: envelope.label,
      reply: envelope.reply === true,
      trace: out.trace,
      stopped: out.stopped,
      changes: out.changes,
      effects: out.effects,
      removed: out.removed,
      spent: [...early.spent, ...fired.spent],
      emitted: out.emitted,

      ...(reactions.length ? { reactions } : {}),
    },
  };
}

function fireBefore(
  envelope: Envelope, sheet: Sheet, ctx: WorldContext,
): { sheet: Sheet; reactions: Report[]; spent: string[]; shared?: Sheet[] } {
  const reactions: Report[] = [];
  const spent: string[] = [];
  let current = sheet;
  let shared = [...(ctx.shared ?? [])];

  const occasion = { kind: 'action' as const, role: 'target' as const, phase: 'before' as const, ask: false, effect: envelope.effect, emitted: [] };
  for (const { id, effect, handler } of listening(ctx.system, sheet, occasion, { compendium: ctx.compendium })) {
    const owner = `триггер «${effect.label || id}»`;
    const refs = { pass: newPass(ctx.system, current, { compendium: ctx.compendium }), results: {}, owner };
    let fits: boolean;
    try {
      fits = holdsNow(handler.if, refs);
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      fits = false;
    }
    if (!fits) continue;

    const done = runOnSelf(id, withSteps(effect, handler.steps), current, {}, owner, { ...ctx, shared });
    current = done.sheet;
    shared = withShared(shared, done.shared);
    reactions.push(done.report);
    if (burnsUse(effect)) {
      current = spendUse(current, id);
      spent.push(id);
    }
  }

  return { sheet: current, reactions, spent, ...(changedShared(shared, ctx.shared).length ? { shared: changedShared(shared, ctx.shared) } : {}) };
}

export function senderResults(envelope: Envelope): Record<string, unknown> {
  return rolledSoFar(envelope.steps as unknown as Record<string, unknown>[]);
}

export type ReactionWindow = 'sender' | 'target' | 'after';

function withEvent(results: Record<string, unknown>, heard: EmittedEvent | undefined): Record<string, unknown> {
  if (!heard) return results;
  return { ...results, event: heard, event_amount: heard.amount, event_incoming: heard.incoming };
}

function runOnSelf(
  id: string, effect: Effect, sheet: Sheet, results: Record<string, unknown>, owner: string,
  { system, compendium, die, clock, shared }: WorldContext, label?: string,
): { sheet: Sheet; report: Report; shared?: Sheet[] } {
  const world = { system, compendium, die, clock, shared };
  const call = { effectId: id, effect, sheet, owner, args: (effect.args || {}) as Record<string, unknown>, props: null, seed: results };
  const packed = packCall(call, world);
  const done = runCall(packed, { sheet, owner, seed: results }, world);
  return {
    sheet: done.sheet,
    ...(done.shared ? { shared: done.shared } : {}),
    report: {
      kind: 'effect', effect: id, from: sheet.id, label: label || effect.label || id,
      reply: false, trace: done.trace, stopped: done.stopped,
      changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
      emitted: done.emitted,
    },
  };
}

function replyFrom(
  id: string, effect: Effect, sheet: Sheet, to: string, results: Record<string, unknown>, owner: string,
  { system, compendium, die }: WorldContext,
): Envelope {
  return {
    kind: 'effect',
    effect: id,
    from: sheet.id,
    to,
    reply: true,
    action: id,
    label: effect.label || id,
    steps: packCall({
      effectId: id, effect, sheet, owner, args: (effect.args || {}) as Record<string, unknown>, props: null, seed: results,
    }, { system, compendium, die }),
  };
}

function holdsQuietly(condition: Parameters<typeof holdsNow>[0], ctx: Parameters<typeof holdsNow>[1]): boolean {
  try {
    return holdsNow(condition, ctx);
  } catch (err) {
    if (!(err instanceof EngineError)) throw err;
    return false;
  }
}

function fireTriggers(
  envelope: Envelope,
  out: { sheet: Sheet; results: Record<string, unknown>; emitted: EmittedEvent[] },
  ctx: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[]; shared?: Sheet[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  const reactions: Report[] = [];
  let sheet = out.sheet;
  let shared = [...(ctx.shared ?? [])];

  const occasion = { kind: 'action' as const, role: 'target' as const, phase: 'after' as const, ask: false, effect: envelope.effect, emitted: out.emitted };
  for (const { id, effect, handler, heard } of listening(ctx.system, sheet, occasion, { compendium: ctx.compendium })) {
    const results = withEvent(out.results, heard);
    const owner = `триггер «${effect.label || id}»`;
    if (!holdsQuietly(handler.if, { pass: newPass(ctx.system, sheet, { compendium: ctx.compendium }), results, owner })) continue;

    const body = withSteps(effect, handler.steps);
    if (runsAtOther(handler)) {
      replies.push(replyFrom(id, body, sheet, envelope.from, results, owner, ctx));
    } else {
      const done = runOnSelf(id, body, sheet, results, owner, { ...ctx, shared });
      sheet = done.sheet;
      shared = withShared(shared, done.shared);
      reactions.push(done.report);
    }

    if (burnsUse(effect)) {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent, reactions, ...(changedShared(shared, ctx.shared).length ? { shared: changedShared(shared, ctx.shared) } : {}) };
}

export function fireOutgoing(
  envelope: Envelope,
  outcome: { results: Record<string, unknown>; emitted: EmittedEvent[] },
  { sheet: sender, targetId }: { sheet: Sheet; targetId: string },
  ctx: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[]; shared?: Sheet[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  const reactions: Report[] = [];
  let sheet = sender;
  let shared = [...(ctx.shared ?? [])];

  const occasion = { kind: 'action' as const, role: 'sender' as const, phase: 'after' as const, ask: false, effect: envelope.effect, emitted: outcome.emitted };
  for (const { id, effect, handler, heard } of listening(ctx.system, sheet, occasion, { compendium: ctx.compendium })) {
    const results = withEvent(outcome.results, heard);
    const owner = `триггер «${effect.label || id}»`;
    if (!holdsQuietly(handler.if, { pass: newPass(ctx.system, sheet, { compendium: ctx.compendium }), results, owner })) continue;

    const body = withSteps(effect, handler.steps);
    if (runsAtOther(handler)) {
      replies.push(replyFrom(id, body, sheet, targetId, results, owner, ctx));
    } else {
      const done = runOnSelf(id, body, sheet, results, owner, { ...ctx, shared });
      sheet = done.sheet;
      shared = withShared(shared, done.shared);
      reactions.push(done.report);
    }

    if (burnsUse(effect)) {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent, reactions, ...(changedShared(shared, ctx.shared).length ? { shared: changedShared(shared, ctx.shared) } : {}) };
}

export interface Offer { id: string; label: string; cost?: string; claims: string[] }

const WINDOWS: Record<ReactionWindow, { role: Role; phase: Phase }> = {
  sender: { role: 'sender', phase: 'before' },
  target: { role: 'target', phase: 'before' },
  after: { role: 'target', phase: 'after' },
};

export function offers(
  envelope: Envelope, window: ReactionWindow,
  { system, sheet, compendium }: WorldContext & { sheet: Sheet },
  results: Record<string, unknown> = {},
  emitted: EmittedEvent[] = [],
): Offer[] {
  const out: Offer[] = [];
  const occasion = { kind: 'action' as const, ...WINDOWS[window], ask: true, effect: envelope.effect, emitted };
  for (const { effect, handler, heard, key } of listening(system, sheet, occasion, { compendium })) {
    const owner = `реакция «${effect.label || key}»`;
    const ctx = { pass: newPass(system, sheet, { compendium }), results: withEvent(results, heard), owner };
    let fits: boolean;
    try {
      fits = holdsNow(handler.if, ctx);
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      fits = false;
    }
    if (!fits) continue;
    out.push({
      id: key, label: effect.label || key,
      claims: [...(handler.claims ?? [])],
    });
  }
  return out;
}

export interface Reacted {
  sheet: Sheet; reports: Report[]; claims: string[]; spent: string[];

  replies: Envelope[];
}

export function react(
  chosen: string[], envelope: Envelope, window: ReactionWindow,
  ctx: WorldContext & { sheet: Sheet },
  results: Record<string, unknown> = {},
  emitted: EmittedEvent[] = [],
): Reacted {
  const offered = offers(envelope, window, ctx, results, emitted);
  let sheet = ctx.sheet;
  const reports: Report[] = [];
  const claims: string[] = [];
  const spent: string[] = [];
  const replies: Envelope[] = [];

  for (const id of chosen) {
    const offer = offered.find(o => o.id === id);
    if (!offer) {
      throw new EngineError(
        `реакция «${id}» сейчас не предлагается; можно: ${offered.map(o => o.id).join(', ') || '(ничего)'}`);
    }
    const found = subscriberByKey(ctx.system, id);
    if (!found) throw new EngineError(`реакция «${id}»: такой подписки в системе нет`);
    const { effect, handler } = found;
    const owner = `реакция «${offer.label}»`;
    if (handler.self?.length) {
      const paid = runOnSelf(found.id, withSteps(effect, handler.self), sheet, results, `плата за «${offer.label}»`, ctx, offer.label);
      const why = refusalWords(paid.report, ctx.system);
      if (why) throw new EngineError(`«${offer.label}» не состоялось: ${why}`);
      sheet = paid.sheet;
      if (paid.report.changes.length) reports.push(paid.report);
    }
    const seed = withEvent(results, hears(handler.on, envelope.effect, emitted) ?? undefined);
    const body = withSteps(effect, handler.steps);
    if (runsAtOther(handler)) {
      replies.push(replyFrom(found.id, body, sheet, envelope.from, seed, owner, ctx));
    } else {
      const done = runOnSelf(found.id, body, sheet, seed, owner, ctx);
      sheet = done.sheet;
      reports.push(done.report);
    }
    claims.push(...offer.claims);
    if (burnsUse(effect)) {
      sheet = spendUse(sheet, found.id);
      spent.push(found.id);
    }
  }
  return { sheet, reports, claims: [...new Set(claims)], spent, replies };
}

export const effectLabelOf = (system: System, id: string): string => {
  const effect = findEffect(system, id);
  return (effect && effect.label) || id;
};
