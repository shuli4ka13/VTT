import { newPass } from '../engine/calc.ts';
import { rolledSoFar } from '../engine/rolled.ts';
import { packCall, runCall } from './call.ts';
import { packRef, resolveRef } from '../engine/refs.ts';
import {
  requireEffect, findEffect, isPipeline, activationOf, durationOf, wornEffects,
} from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { incomingRollModifiers } from '../engine/modifiers.ts';
import type { Clock } from '../engine/clock.ts';
import type {
  System, Sheet, Compendium, CompendiumRecord, Binding, Die, Effect, Activation,
} from '../model/types.ts';
import type { StepData } from '../engine/steps/index.ts';
import type { EmittedEvent } from '../engine/rule.ts';
import type { RefContext } from '../engine/refs.ts';

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
}

export function bindingsOf(record: CompendiumRecord, system: System): Binding[] {
  if (record.activities && record.activities.length) return record.activities;
  if (record.effect) return [{ label: record.label, effect: String(record.effect), args: (record.args || {}) as Binding['args'] }];
  const decl = (system.records || {})[String(record.rk)];
  return decl?.bindings || [];
}

export function availableActions(
  sheet: Sheet, { system, compendium }: { system: System; compendium: Compendium },
): Action[] {
  const out: Action[] = [];

  for (const itemId of sheet.equipped || []) {
    const item = (compendium.items || []).find(i => i.id === itemId);
    if (item) out.push(...actionsOfRecord(item, system, true));
  }

  for (const actionId of (sheet.actions as string[] | undefined) || []) {
    const record = (compendium.actions || []).find(a => a.id === actionId);
    if (record) out.push(...actionsOfRecord(record, system, false));
  }

  return out;
}

export function actionOf(
  actionId: string, { system, compendium }: { system: System; compendium: Compendium },
): Action {
  const at = String(actionId).lastIndexOf(':');
  const recordId = at > 0 ? String(actionId).slice(0, at) : String(actionId);
  const index = at > 0 ? Number(String(actionId).slice(at + 1)) : 0;

  const item = (compendium.items || []).find(r => r.id === recordId);
  const record = item || (compendium.actions || []).find(r => r.id === recordId);
  if (!record) throw new EngineError(`в компендиуме нет записи «${recordId}»`);

  const action = actionsOfRecord(record, system, Boolean(item))[index];
  if (!action) {
    throw new EngineError(
      `запись «${record.label}» (${recordId}) не даёт действия №${index}: ` +
      'ни своей активности, ни привязки у её рода');
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
  { system, sheet, compendium, die, against, claims, inputs, kept }: WorldContext & { sheet: Sheet } & SendOptions,
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
    props: propsOf(action.record, system),
    owner: `эффект «${effect.label || action.effect}»`,
    ...(inputs ? { inputs } : {}),
    ...(targetPass ? { against: (rollTag: string | null) => incomingRollModifiers(rollTag, targetPass) } : {}),
    ...(claims?.length ? { claims } : {}),
    ...(kept?.length ? { kept } : {}),
  }, { system, compendium, die });

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
  { system, sheet, compendium, die, claims, clock }: WorldContext & { sheet: Sheet } & { claims?: string[] },
): ReceiveResult {
  const holder = findEffect(system, envelope.effect);
  const early = envelope.reply
    ? { sheet, reactions: [] as Report[], spent: [] as string[] }
    : fireBefore(envelope, sheet, { system, compendium, die, clock });
  const out = runCall(envelope.steps || [], {
    sheet: early.sheet, owner: `конверт «${envelope.label}»`,
    ...(claims?.length ? { claims } : {}),
    ...(holder?.bond ? { bond: { from: envelope.from, by: envelope.effect } } : {}),
  }, { system, compendium, die, clock });

  const fired = envelope.reply
    ? { sheet: out.sheet, replies: [], spent: [], reactions: [] }
    : fireTriggers(envelope, out, { system, compendium, die, clock });
  const reactions = [...early.reactions, ...fired.reactions];

  return {
    sheet: fired.sheet,
    replies: fired.replies,
    results: out.results,
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
): { sheet: Sheet; reactions: Report[]; spent: string[] } {
  const reactions: Report[] = [];
  const spent: string[] = [];
  let current = sheet;

  for (const { id, effect } of candidatesOf(ctx.system, sheet, 'triggered', true)) {
    const trigger = effect.trigger;
    if (!trigger || (trigger.direction ?? 'in') !== 'in' || trigger.when !== 'before') continue;
    if (heardBy(trigger.on, envelope.effect, []) === null) continue;

    const owner = `триггер «${effect.label || id}»`;
    const refs = { pass: newPass(ctx.system, current, { compendium: ctx.compendium }), results: {}, owner };
    let fits: boolean;
    try {
      fits = conditionHolds(trigger.condition === undefined || trigger.condition === null
        ? null : packRef(trigger.condition, refs), refs);
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      fits = false;
    }
    if (!fits) continue;

    const done = runOnSelf(id, effect, current, {}, owner, ctx);
    current = done.sheet;
    reactions.push(done.report);
    if (durationOf(effect) === 'uses') {
      current = spendUse(current, id);
      spent.push(id);
    }
  }

  return { sheet: current, reactions, spent };
}

export function senderResults(envelope: Envelope): Record<string, unknown> {
  return rolledSoFar(envelope.steps as unknown as Record<string, unknown>[]);
}

export const EVENT_PREFIX = 'event:';

export type TriggerDirection = 'in' | 'out';
export type ReactionWindow = 'sender' | 'target' | 'after';

interface Candidate { id: string; effect: Effect }

function candidatesOf(system: System, sheet: Sheet, activation: Activation, withRoom: boolean): Candidate[] {
  const worn = wornEffects(system, sheet, { strict: false });
  const wornIds = new Set(worn.map(w => w.id));
  const room = withRoom
    ? (system.room_rules ?? [])
      .filter(id => !wornIds.has(id))
      .map(id => ({ id, effect: findEffect(system, id) }))
      .filter((c): c is Candidate => Boolean(c.effect))
    : [];
  return [...worn, ...room].filter(({ effect }) => activationOf(effect) === activation);
}

function heardBy(on: string, effectId: string, emitted: EmittedEvent[]): EmittedEvent | undefined | null {
  if (on === '*') return undefined;
  if (on.startsWith(EVENT_PREFIX)) return emitted.filter(e => `${EVENT_PREFIX}${e.event}` === on).at(-1) ?? null;
  return on === effectId ? undefined : null;
}

function withEvent(results: Record<string, unknown>, heard: EmittedEvent | undefined): Record<string, unknown> {
  if (!heard) return results;
  return { ...results, event: heard, event_amount: heard.amount, event_incoming: heard.incoming };
}

function runOnSelf(
  id: string, effect: Effect, sheet: Sheet, results: Record<string, unknown>, owner: string,
  { system, compendium, die, clock }: WorldContext,
): { sheet: Sheet; report: Report } {
  const world = { system, compendium, die, clock };
  const call = { effectId: id, effect, sheet, owner, args: (effect.args || {}) as Record<string, unknown>, props: null, seed: results };
  const packed = packCall(call, world);
  const done = runCall(packed, { sheet, owner, seed: results }, world);
  return {
    sheet: done.sheet,
    report: {
      kind: 'effect', effect: id, from: sheet.id, label: effect.label || id,
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

function fireTriggers(
  envelope: Envelope,
  out: { sheet: Sheet; results: Record<string, unknown>; emitted: EmittedEvent[] },
  ctx: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  const reactions: Report[] = [];
  let sheet = out.sheet;

  for (const { id, effect } of candidatesOf(ctx.system, sheet, 'triggered', true)) {
    const trigger = effect.trigger;
    if (!trigger || (trigger.direction ?? 'in') !== 'in') continue;
    const heard = heardBy(trigger.on, envelope.effect, out.emitted);
    if (heard === null) continue;
    if ((trigger.when || 'resolved') !== 'resolved') continue;

    const results = withEvent(out.results, heard);
    const owner = `триггер «${effect.label || id}»`;
    if (!conditionHolds(trigger.condition, { pass: newPass(ctx.system, sheet, { compendium: ctx.compendium }), results, owner })) continue;

    if ((trigger.to ?? 'sender') === 'self') {
      const done = runOnSelf(id, effect, sheet, results, owner, ctx);
      sheet = done.sheet;
      reactions.push(done.report);
    } else {
      replies.push(replyFrom(id, effect, sheet, envelope.from, results, owner, ctx));
    }

    if (durationOf(effect) === 'uses') {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent, reactions };
}

export function fireOutgoing(
  envelope: Envelope,
  outcome: { results: Record<string, unknown>; emitted: EmittedEvent[] },
  { sheet: sender, targetId }: { sheet: Sheet; targetId: string },
  ctx: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  const reactions: Report[] = [];
  let sheet = sender;

  for (const { id, effect } of candidatesOf(ctx.system, sheet, 'triggered', true)) {
    const trigger = effect.trigger;
    if (!trigger || trigger.direction !== 'out') continue;
    const heard = heardBy(trigger.on, envelope.effect, outcome.emitted);
    if (heard === null) continue;

    const results = withEvent(outcome.results, heard);
    const owner = `триггер «${effect.label || id}»`;
    if (!conditionHolds(trigger.condition, { pass: newPass(ctx.system, sheet, { compendium: ctx.compendium }), results, owner })) continue;

    if (trigger.to === 'target') {
      replies.push(replyFrom(id, effect, sheet, targetId, results, owner, ctx));
    } else {
      const done = runOnSelf(id, effect, sheet, results, owner, ctx);
      sheet = done.sheet;
      reactions.push(done.report);
    }

    if (durationOf(effect) === 'uses') {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent, reactions };
}

export interface Offer { id: string; label: string; cost?: string; claims: string[] }

export function offers(
  envelope: Envelope, window: ReactionWindow,
  { system, sheet, compendium }: WorldContext & { sheet: Sheet },
  results: Record<string, unknown> = {},
  emitted: EmittedEvent[] = [],
): Offer[] {
  const out: Offer[] = [];
  for (const { id, effect } of candidatesOf(system, sheet, 'reaction', false)) {
    const trigger = effect.trigger;
    if (!trigger || (trigger.window ?? 'target') !== window) continue;
    const heard = heardBy(trigger.on, envelope.effect, emitted);
    if (heard === null) continue;
    const owner = `реакция «${effect.label || id}»`;
    const ctx = { pass: newPass(system, sheet, { compendium }), results: withEvent(results, heard), owner };
    let fits: boolean;
    try {
      fits = conditionHolds(trigger.condition === undefined || trigger.condition === null
        ? null : packRef(trigger.condition, ctx), ctx);
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      fits = false;
    }
    if (!fits) continue;
    out.push({
      id, label: effect.label || id,
      ...(effect.cost ? { cost: effect.cost } : {}),
      claims: [...(trigger.claims ?? [])],
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
    const effect = requireEffect(ctx.system, id, 'реакция');
    const owner = `реакция «${offer.label}»`;
    const seed = withEvent(results, heardBy(effect.trigger?.on ?? '*', envelope.effect, emitted) ?? undefined);
    if (window === 'after' && (effect.trigger?.to ?? 'sender') !== 'self') {
      replies.push(replyFrom(id, effect, sheet, envelope.from, seed, owner, ctx));
    } else {
      const done = runOnSelf(id, effect, sheet, seed, owner, ctx);
      sheet = done.sheet;
      reports.push(done.report);
    }
    claims.push(...offer.claims);
    if (durationOf(effect) === 'uses') {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }
  return { sheet, reports, claims: [...new Set(claims)], spent, replies };
}

function conditionHolds(condition: unknown, ctx: RefContext): boolean {
  if (condition === null || condition === undefined) return true;
  const value = resolveRef(condition, ctx);
  if (typeof value !== 'boolean') {
    throw new EngineError(
      `${ctx.owner}: условие должно давать логическое значение, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

export function spendUse(sheet: Sheet, effectId: string): Sheet {
  const effects: Sheet['effects'] = [];
  for (const entry of sheet.effects || []) {
    if (entry.effectId !== effectId) { effects.push(entry); continue; }
    const left = Number(entry.usesLeft ?? 1) - 1;
    if (left > 0) effects.push({ ...entry, usesLeft: left });
  }
  return { ...sheet, effects };
}

export function propsOf(record: CompendiumRecord, system: System): Record<string, unknown> | null {
  const decl = (system.records || {})[String(record.rk)];
  if (!decl?.props || !decl.props.length) return null;
  const props: Record<string, unknown> = {};
  for (const p of decl.props) {
    if (record.props && record.props[p.key] !== undefined) props[p.key] = record.props[p.key];
  }
  return props;
}

export const effectLabelOf = (system: System, id: string): string => {
  const effect = findEffect(system, id);
  return (effect && effect.label) || id;
};
