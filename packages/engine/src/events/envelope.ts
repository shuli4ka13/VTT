import { newPass } from '../engine/calc.ts';
import { packRule, resolveRule } from '../engine/rule.ts';
import { resolveRef } from '../engine/refs.ts';
import {
  requireEffect, findEffect, isPipeline, activationOf, durationOf, wornEffects,
} from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import type {
  System, Sheet, Compendium, CompendiumRecord, Binding, Die, Effect,
} from '../model/types.ts';
import type { StepData } from '../engine/steps/index.ts';
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

  reactions?: Report[];
}

export interface ReceiveResult {
  sheet: Sheet;
  replies: Envelope[];
  report: Report;
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

export function send(
  actionId: string,
  { system, sheet, compendium, die }: WorldContext & { sheet: Sheet },
): Envelope {
  const action = actionOf(actionId, { system, compendium });

  const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
  if (!isPipeline(effect)) {
    throw new EngineError(
      `действие «${action.label}» зовёт эффект «${effect.label || action.effect}», ` +
      'а он пассивный: у пассивного конвейера шагов нет, его вешают, а не применяют');
  }

  const pass = newPass(system, sheet, { compendium });
  const steps = packRule(effect, {
    system, sheet, pass, die,
    params: action.binding.args || {},
    props: propsOf(action.record, system),
    owner: `эффект «${effect.label || action.effect}»`,
  });

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
  { system, sheet, compendium, die }: WorldContext & { sheet: Sheet },
): ReceiveResult {
  const pass = newPass(system, sheet, { compendium });
  const out = resolveRule(envelope.steps || [], {
    system, sheet, pass, die,
    owner: `конверт «${envelope.label}»`,
  });

  const fired = envelope.reply
    ? { sheet: out.sheet, replies: [], spent: [], reactions: [] }
    : fireTriggers(envelope, out, { system, compendium, die });

  return {
    sheet: fired.sheet,
    replies: fired.replies,
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
      spent: fired.spent,

      ...(fired.reactions.length ? { reactions: fired.reactions } : {}),
    },
  };
}

function fireTriggers(
  envelope: Envelope, out: { sheet: Sheet; results: Record<string, unknown> }, { system, compendium, die }: WorldContext,
): { sheet: Sheet; replies: Envelope[]; spent: string[]; reactions: Report[] } {
  const replies: Envelope[] = [];
  const spent: string[] = [];
  const reactions: Report[] = [];
  let sheet = out.sheet;

  const worn = wornEffects(system, sheet, { strict: false });
  const wornIds = new Set(worn.map(w => w.id));
  const candidates = [
    ...worn,
    ...(system.room_rules ?? [])
      .filter(id => !wornIds.has(id))
      .map(id => ({ id, effect: findEffect(system, id) }))
      .filter((c): c is { id: string; effect: Effect } => Boolean(c.effect)),
  ].filter(({ effect }) => activationOf(effect) === 'triggered');

  for (const { id, effect } of candidates) {
    const trigger = effect.trigger;
    if (!trigger) continue;
    if (trigger.on !== envelope.effect) continue;
    if ((trigger.when || 'resolved') !== 'resolved') continue;

    const pass = newPass(system, sheet, { compendium });
    const owner = `триггер «${effect.label || id}»`;
    if (!conditionHolds(trigger.condition, { pass, results: out.results, owner })) continue;

    if ((trigger.to ?? 'sender') === 'self') {

      const packed = packRule(effect, {
        system, sheet, pass, die,
        params: (effect.args || {}) as Record<string, unknown>,
        props: null,
        owner,
      });
      const done = resolveRule(packed, {
        system, sheet, die,
        pass: newPass(system, sheet, { compendium }),
        results: out.results,
        owner,
      });
      sheet = done.sheet;
      reactions.push({
        kind: 'effect', effect: id, from: sheet.id, label: effect.label || id,
        reply: false, trace: done.trace, stopped: done.stopped,
        changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
      });
    } else {
      replies.push({
        kind: 'effect',
        effect: id,
        from: sheet.id,
        to: envelope.from,
        reply: true,
        action: id,
        label: effect.label || id,
        steps: packRule(effect, {
          system, sheet, pass, die,
          params: (effect.args || {}) as Record<string, unknown>,
          props: null,
          owner,
        }),
      });
    }

    if (durationOf(effect) === 'uses') {
      sheet = spendUse(sheet, id);
      spent.push(id);
    }
  }

  return { sheet, replies, spent, reactions };
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
