import { stepModule } from '../engine/steps/index.ts';
import { answerSteps } from '../engine/steps/emit.ts';
import { rolledSoFar } from '../engine/rolled.ts';
import { findField, holderIdOf, livesOn } from '../engine/calc.ts';
import { requireEffect, reapplyOf, usesMax } from '../engine/effects.ts';
import { expiryOf } from '../engine/clock.ts';
import { holdsNow } from '../engine/refs.ts';
import { whoseOf, burnsUse, spendUse } from '../events/durations.ts';
import { guardHolds, packGuardRef, MAX_CALL_DEPTH } from '../engine/rule.ts';
import { EngineError, isRuleError } from '../engine/errors.ts';
import { listening, subscriberByKey, hears, runsAtOther } from '../events/bus.ts';
import { MAX_HOPS } from './limits.ts';
import { holderOf as bondHolderOf } from '../events/bonds.ts';
import { refusalWords } from '../events/refusal.ts';
import { MAX_REPLIES } from './limits.ts';
import type { State } from './state.ts';
import type { External, Question } from './journal.ts';
import type { StepContext, StepData } from '../engine/steps/index.ts';
import type { Change, EmittedEvent, NestedRun, StopReason } from '../engine/rule.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import { incomingRollModifiers } from '../engine/modifiers.ts';
import type { Offer, Report, ReactionWindow } from './types.ts';
import type { ActionMoment, Subscriber } from '../events/bus.ts';
import type { Param, Sheet, Step, StoredValue, WornEffect } from '../model/types.ts';

export type Packed = (index: number) => StepData | undefined;

export interface Frame {
  scope: string;
  me: string;
  here: string;
  target: string | null;
  effectId: string;
  owner: string;
  args: Record<string, unknown>;
  paramDefs: Param[];
  props: Record<string, unknown> | null;
  inputs?: Record<string, number | string>;
  claims?: string[];
  kept?: Record<string, StepData>;
  against?: (tags: readonly string[]) => SourcedModifier[];
  packed?: Packed;
  bond?: { from: string; by: string };
  source: string;
  hop: number;
  names: 'me' | 'here';
  alone?: boolean;
  actor?: boolean;
  chain?: string[];
}

export interface Sink {
  trace: Record<string, unknown>[];
  changes: Change[];
  effects: string[];
  removed: string[];
  emitted: EmittedEvent[];
  reactions: Report[];
  after: Entry[];
  spent: string[];
}

export type Entry = { fromId: string; toId: string; report: Report } | { text: string };

export const newSink = (): Sink => ({ trace: [], changes: [], effects: [], removed: [], emitted: [], reactions: [], after: [], spent: [] });

export interface Ran {
  results: Record<string, unknown>;
  stopped: StopReason | null;
  packed: StepData[];
}

export interface Call {
  effectId: string;
  label: string;
  steps: Step[];
  from: string;
  to: string;
  hop: number;
  scope: string;
  seed?: Record<string, unknown>;
  args?: Record<string, unknown>;
  paramDefs?: Param[];
  props?: Record<string, unknown> | null;
  inputs?: Record<string, number | string>;
  claims?: string[];
  packed?: Packed;
  asks: boolean;
}

export interface Delivery {
  results: Record<string, unknown>;
  emitted: EmittedEvent[];
  report: Report;
  entries: Entry[];
}

type Mode = 'action' | 'event' | 'any';

const WINDOWS: Record<ReactionWindow, ActionMoment> = { sender: 'acting', target: 'targeted', after: 'affected' };

export const withEvent = (results: Record<string, unknown>, heard: EmittedEvent | undefined | null): Record<string, unknown> =>
  (heard ? { ...results, event: heard, event_amount: heard.amount, event_incoming: heard.incoming } : results);

export function reportOf(
  kind: string, effect: string, from: string, label: string, sink: Sink, stopped: StopReason | null, reply: boolean,
): Report {
  return {
    kind, effect, from, label, reply,
    trace: sink.trace, stopped, changes: sink.changes, effects: sink.effects, removed: sink.removed, spent: sink.spent,
    emitted: sink.emitted,
    ...(sink.reactions.length ? { reactions: sink.reactions } : {}),
  };
}

const who = (frame: Frame): string => frame.owner || 'правило';

export class Runner {
  budget = MAX_REPLIES;
  cut = false;
  private drying = 0;

  constructor(readonly state: State, readonly ext: External) {}

  get system() { return this.state.system; }

  private context(frame: Frame, sink: Sink, results: Record<string, unknown>, scope: string): StepContext {
    const { state } = this;
    const system = state.system;
    const here = frame.here;

    const holderOf = (tag: string): string => {
      const field = findField(system, tag);
      const id = holderIdOf(field, state.get(here));
      if (!id || id === here) return here;
      if (!state.find(id)) {
        if (livesOn(field) === 'group') return here;
        throw new EngineError(`${who(frame)}: поле «${tag}» лежит на столе, а стола здесь нет`);
      }
      return id;
    };

    const read = (tag: string): unknown => {
      const sheet = state.get(holderOf(tag));
      if (Object.prototype.hasOwnProperty.call(sheet.values, tag)) return sheet.values[tag];
      const field = findField(system, tag);
      if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
      return field.value.kind === 'stored' ? field.value.default : undefined;
    };

    const write = (tag: string, to: StoredValue): void => {
      const from = read(tag);
      if (Object.is(from, to)) return;
      const holder = state.get(holderOf(tag));
      sink.changes.push({ tag, from, to });
      state.put({ ...holder, values: { ...holder.values, [tag]: to } });
    };

    const attach = (effectId: string, extra?: Record<string, number>): void => {
      const effect = requireEffect(system, effectId, who(frame));
      const sheet = state.get(here);
      const worn: WornEffect[] = [...(sheet.effects ?? [])];
      const at = worn.findIndex(e => e.effectId === effectId);
      const fresh: WornEffect = {
        effectId,
        ...(extra ?? {}),
        ...expiryOf(effect, state.clock),
        ...(whoseOf(effect) === 'source' && frame.source ? { from: frame.source } : {}),
        ...(frame.bond ? { from: frame.bond.from, by: frame.bond.by } : {}),
      };
      const max = usesMax(effect);
      if (max !== null) fresh.usesLeft = max;
      if (at < 0) worn.push(fresh);
      else if (reapplyOf(effect) === 'refresh') worn[at] = fresh;
      else if (reapplyOf(effect) === 'stack') worn.push(fresh);
      else return;
      state.put({ ...sheet, effects: worn });
      if (!sink.effects.includes(effectId)) sink.effects.push(effectId);
    };

    const detach = (effectId: string): void => {
      requireEffect(system, effectId, who(frame));
      const sheet = state.get(here);
      const worn = (sheet.effects ?? []).filter(e => e.effectId !== effectId);
      if (worn.length === (sheet.effects ?? []).length) return;
      state.put({ ...sheet, effects: worn });
      sink.removed.push(effectId);
    };

    const me = state.pass(frame.me);
    return {
      system,
      sheet: state.get(here),
      die: this.ext.dieAt(scope),
      pass: state.pass(here),
      direct: {
        me,
        target: frame.target ? state.pass(frame.target) : null,
        ...(frame.names === 'me' ? { names: me } : {}),
      },
      params: frame.args,
      paramDefs: frame.paramDefs,
      props: frame.props,
      ...(frame.inputs ? { inputs: frame.inputs } : {}),
      owner: frame.owner,
      results,
      ...(frame.claims?.length ? { claims: frame.claims } : {}),
      ...(frame.kept ? { kept: frame.kept } : {}),
      ...(frame.against ? { against: frame.against } : {}),
      ...(frame.alone ? { alone: true } : {}),
      read, write, attach, detach,
      emit: (event: EmittedEvent) => { sink.emitted.push(event); },
      run: (list, seed, within, params, paramDefs) => this.eventCall(
        frame, String(within), (seed as { event: EmittedEvent }).event, list, params, paramDefs, sink, results, scope),
      answer: call => this.answer(frame, call, sink, scope),
      expiry: effect => expiryOf(effect, state.clock),
      ...(frame.bond ? { bond: frame.bond } : {}),
      source: frame.source,
      shared: state.shared(),
    };
  }

  exec(frame: Frame, steps: Step[], sink: Sink, seed: Record<string, unknown> = {}, within?: string): Ran {
    const results: Record<string, unknown> = { ...seed };
    const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
    const done: StepData[] = [];
    for (const [index, step] of steps.entries()) {
      const name = step.id ?? index;
      const mod = stepModule(step.type);
      const ctx = {
        ...this.context(frame, sink, results, `${frame.scope}/${name}`),
        sender: rolledSoFar(done as unknown as Record<string, unknown>[]),
        stepIds,
      };
      const mark = within ? { within } : {};
      const skip = () => sink.trace.push({ step: name, type: step.type, skipped: true, ...mark });
      const when = packGuardRef((step as StepData).when, ctx);
      if (!guardHolds(when, ctx)) {
        done.push({ type: step.type, id: step.id ?? null, ...(when !== undefined ? { when } : {}) } as StepData);
        skip();
        continue;
      }
      const packed: StepData = frame.packed?.(index) ?? { type: step.type, id: step.id ?? null, ...mod.pack(step as StepData, ctx) } as StepData;
      done.push(packed);
      if (!guardHolds(packed.when, ctx)) {
        skip();
        continue;
      }
      const at = sink.trace.length;
      const out = mod.resolve(packed, ctx);
      sink.trace.splice(at, 0, { step: name, type: step.type, ...mark, ...out.trace });
      if (step.id != null) results[step.id] = out.value;
      if (out.break) {
        return {
          results, packed: done,
          stopped: { step: name, type: step.type, reason: out.break.reason, ...(out.break.note ? { note: out.break.note } : {}) },
        };
      }
    }
    return { results, stopped: null, packed: done };
  }

  eventCall(
    frame: Frame, event: string, payload: EmittedEvent, steps: Step[],
    args: Record<string, unknown> | undefined, paramDefs: Param[] | undefined, sink: Sink, parent: Record<string, unknown>,
    at: string,
  ): NestedRun {
    const heard = [payload];
    const scope = `${at}>${event}`;
    const chain = [...(frame.chain ?? []), event];
    if (chain.length > MAX_CALL_DEPTH) {
      throw new EngineError(`${who(frame)}: вызовы вложены глубже ${MAX_CALL_DEPTH} — похоже, идут по кругу: ${chain.join(' → ')}`);
    }
    this.fire('targeted', 'event', frame.here, event, heard, parent, frame.me, `${scope}<`, frame.hop, sink);
    const inner: Frame = {
      ...frame, scope, target: frame.here, effectId: event, args: args ?? {}, paramDefs: paramDefs ?? [], props: null,
      names: 'here', packed: undefined, claims: undefined, kept: undefined, against: undefined, alone: false, inputs: undefined, chain, actor: false,
    };
    const ran = this.exec(inner, steps, sink, { event: payload }, event);
    this.fire('affected', 'event', frame.here, event, heard, parent, frame.me, `${scope}>`, frame.hop, sink);
    if (frame.actor) this.fire('acted', 'event', frame.me, event, heard, parent, frame.here, `${scope}^`, frame.hop, sink);
    return { results: ran.results, stopped: ran.stopped };
  }

  answer(frame: Frame, call: { event: string; args: Record<string, unknown> }, sink: Sink, at: string): void {
    if (frame.me === frame.here) return;
    if (frame.hop >= MAX_HOPS) { this.cut = true; return; }
    const effect = requireEffect(this.system, call.event, who(frame));
    const delivered = this.deliver({
      effectId: call.event, label: effect.label || call.event, steps: answerSteps(call),
      from: frame.here, to: frame.me, hop: frame.hop + 1, scope: `${at}=${call.event}`, asks: true,
    });
    if (delivered) sink.after.push(...delivered.entries);
  }

  fire(
    moment: ActionMoment, mode: Mode, sheetId: string, effectId: string, emitted: EmittedEvent[],
    seed: Record<string, unknown>, other: string | null, scope: string, hop: number, sink: Sink,
  ): void {
    const sheet = this.state.find(sheetId);
    if (!sheet) return;
    const occasion = { kind: 'action' as const, moment, confirm: false, effect: effectId, emitted };
    const seen = new Map<string, number>();
    for (const sub of listening(this.system, sheet, occasion, { compendium: this.state.compendium })) {
      const nth = seen.get(sub.key) ?? 0;
      seen.set(sub.key, nth + 1);
      const event = sub.handler.of?.startsWith('event:') ?? false;
      if ((mode === 'event' && !event) || (mode === 'action' && event)) continue;
      const results = withEvent(seed, sub.heard);
      if (!this.holds(sub, sheetId, results)) continue;
      this.handle(sub, sheetId, results, other, `${scope}~${sub.key}${nth ? `@${nth}` : ''}`, hop, sink);
    }
  }

  private holds(sub: Subscriber, sheetId: string, results: Record<string, unknown>): boolean {
    try {
      return holdsNow(sub.handler.if, { pass: this.state.pass(sheetId), results, owner: `триггер «${sub.effect.label || sub.id}»` });
    } catch (err) {
      if (!isRuleError(err)) throw err;
      return false;
    }
  }

  private selfFrame(sub: Subscriber, sheetId: string, scope: string, hop: number, owner: string): Frame {
    return {
      scope, me: sheetId, here: sheetId, target: sheetId, effectId: sub.id, owner,
      args: (sub.effect.args || {}) as Record<string, unknown>, paramDefs: sub.effect.params ?? [], props: null,
      source: sheetId, hop, names: 'here',
    };
  }

  handle(
    sub: Subscriber, sheetId: string, seed: Record<string, unknown>, other: string | null,
    scope: string, hop: number, sink: Sink, label?: string,
  ): void {
    const { id, effect, handler } = sub;
    const name = label || effect.label || id;
    if (runsAtOther(handler)) {
      if (!other) return;
      if (hop >= MAX_HOPS) { this.cut = true; return; }
      const delivered = this.deliver({
        effectId: id, label: name, steps: handler.steps ?? [], from: sheetId, to: other, hop: hop + 1,
        scope, seed, args: (effect.args || {}) as Record<string, unknown>, paramDefs: effect.params ?? [], asks: true,
      });
      if (!delivered) return;
      sink.after.push(...delivered.entries);
    } else {
      const own = newSink();
      const ran = this.exec(this.selfFrame(sub, sheetId, scope, hop, `триггер «${name}»`), handler.steps ?? [], own, seed);
      sink.reactions.push(reportOf('effect', id, sheetId, name, own, ran.stopped, false));
      sink.after.push(...own.after);
    }
    if (burnsUse(effect)) {
      this.state.put(spendUse(this.state.get(sheetId), id));
      sink.spent.push(id);
    }
  }

  dry<T>(work: () => T): T {
    const saved = this.state.save();
    const budget = this.budget;
    const cut = this.cut;
    this.drying++;
    try {
      return work();
    } finally {
      this.drying--;
      this.state.restore(saved);
      this.budget = budget;
      this.cut = cut;
    }
  }

  refusal(offerId: string, sheetId: string, results: Record<string, unknown>, scope: string): string | null {
    const found = subscriberByKey(this.system, offerId);
    if (!found?.handler.cost?.length) return null;
    const label = found.effect.label || offerId;
    return this.dry(() => {
      const own = newSink();
      const ran = this.exec(this.selfFrame(found, sheetId, `${scope}$`, 0, `плата за «${label}»`), found.handler.cost ?? [], own, results);
      return refusalWords(reportOf('effect', found.id, sheetId, label, own, ran.stopped, false), this.system);
    });
  }

  offers(
    window: ReactionWindow, sheetId: string, effectId: string, hop: number,
    results: Record<string, unknown>, emitted: EmittedEvent[], scope: string,
  ): Offer[] {
    const sheet = this.state.find(sheetId);
    if (!sheet) return [];
    const offered = this.listen(window, sheet, effectId, hop, results, emitted);
    if (hop >= MAX_HOPS && this.listen(window, sheet, effectId, 0, results, emitted).length > offered.length) this.cut = true;
    return offered.filter(offer => !this.refusal(offer.id, sheetId, results, `${scope}?${offer.id}`));
  }

  private listen(
    window: ReactionWindow, sheet: Sheet, effectId: string, hop: number,
    results: Record<string, unknown>, emitted: EmittedEvent[],
  ): Offer[] {
    const out: Offer[] = [];
    const occasion = { kind: 'action' as const, moment: WINDOWS[window], confirm: true, effect: effectId, emitted };
    for (const sub of listening(this.system, sheet, occasion, { compendium: this.state.compendium })) {
      if (!this.holds(sub, sheet.id, withEvent(results, sub.heard))) continue;
      if (runsAtOther(sub.handler) && hop >= MAX_HOPS) continue;
      out.push({ id: sub.key, label: sub.effect.label || sub.key, claims: [...(sub.handler.claims ?? [])] });
    }
    return out;
  }

  ask(
    question: Question, effectId: string, hop: number, emitted: EmittedEvent[], other: string | null,
  ): { claims: string[]; entries: Entry[] } {
    const chosen = this.drying ? [] : this.ext.ask(question);
    const { sheetId, results } = question;
    const stray = chosen.find(id => !question.offers.some(offer => offer.id === id));
    if (stray) {
      throw new EngineError(`реакция «${stray}» сейчас не предлагается; можно: ${question.offers.map(o => o.id).join(', ') || '(ничего)'}`);
    }
    const entries: Entry[] = [];
    const claims: string[] = [];
    for (const id of chosen) {
      const found = subscriberByKey(this.system, id);
      if (!found) throw new EngineError(`реакция «${id}»: такой подписки в системе нет`);
      const label = found.effect.label || id;
      if (found.handler.cost?.length) {
        const paid = newSink();
        const ran = this.exec(this.selfFrame(found, sheetId, `${question.key}$${id}`, hop, `плата за «${label}»`), found.handler.cost, paid, results);
        const report = reportOf('effect', found.id, sheetId, label, paid, ran.stopped, false);
        const why = refusalWords(report, this.system);
        if (why) throw new EngineError(`«${label}» не состоялось: ${why}`);
        if (paid.changes.length) entries.push({ fromId: sheetId, toId: sheetId, report });
      }
      const seed = withEvent(results, hears(found.handler.of, effectId, emitted));
      const sink = newSink();
      if (runsAtOther(found.handler)) {
        this.handle(found, sheetId, seed, other, `${question.key}!${id}`, hop, sink, label);
      } else {
        const ran = this.exec(this.selfFrame(found, sheetId, `${question.key}!${id}`, hop, `реакция «${label}»`), found.handler.steps ?? [], sink, seed);
        entries.push({ fromId: sheetId, toId: sheetId, report: reportOf('effect', found.id, sheetId, label, sink, ran.stopped, false) });
        if (burnsUse(found.effect)) this.state.put(spendUse(this.state.get(sheetId), found.id));
      }
      entries.push(...sink.after);
      claims.push(...(found.handler.claims ?? []));
    }
    if (!chosen.length && !this.ext.declineAll) entries.push({ text: `${this.state.get(sheetId).name} пропускает реакцию` });
    return { claims: [...new Set(claims)], entries };
  }

  body(call: Call, sink: Sink, claims: string[]): Ran {
    const effect = this.system.effects[call.effectId];
    const holder = effect?.bond && call.hop === 0 ? bondHolderOf(call.effectId, effect) : null;
    const frame: Frame = {
      scope: claims.length ? `${call.scope}:c=${[...claims].sort().join(',')}` : call.scope,
      me: call.from, here: call.to, target: call.to, effectId: call.effectId,
      owner: `конверт «${call.label}»`,
      args: call.args ?? {}, paramDefs: call.paramDefs ?? [], props: call.props ?? null,
      ...(call.inputs ? { inputs: call.inputs } : {}),
      ...(claims.length ? { claims } : {}),
      ...(call.packed ? { packed: call.packed } : {}),
      ...(holder ? { bond: { from: call.from, by: holder } } : {}),
      against: (tags: readonly string[]) => incomingRollModifiers(tags, this.state.pass(call.to)),
      source: call.from, hop: call.hop, names: 'me', actor: call.hop === 0,
    };
    return this.exec(frame, call.steps, sink, call.seed ?? {});
  }

  deliver(call: Call): Delivery | null {
    if (call.hop > 0) {
      if (this.budget <= 0) { this.cut = true; return null; }
      this.budget--;
    }
    if (!this.state.find(call.to)) return null;
    const entries: Entry[] = [];
    let claims = call.claims ?? [];
    if (call.asks) {
      const dry = this.dry(() => { const sink = newSink(); const ran = this.body(call, sink, claims); return { ran, sink }; });
      const before = this.offers('target', call.to, call.effectId, call.hop, dry.ran.results, dry.sink.emitted, `${call.scope}:target`);
      if (before.length) {
        const asked = this.ask({
          key: `${call.scope}:target`, sheetId: call.to, window: 'target', label: call.label,
          offers: before, results: dry.ran.results, preview: [],
        }, call.effectId, call.hop, dry.sink.emitted, call.from);
        entries.push(...asked.entries);
        claims = [...new Set([...claims, ...asked.claims])];
      }
    }
    const sink = newSink();
    this.fire('targeted', 'action', call.to, call.effectId, [], {}, call.from, `${call.scope}<`, call.hop, sink);
    const ran = this.body(call, sink, claims);
    this.fire('affected', 'action', call.to, call.effectId, sink.emitted, ran.results, call.from, `${call.scope}>`, call.hop, sink);
    const report = reportOf('effect', call.effectId, call.from, call.label, sink, ran.stopped, call.hop > 0);
    entries.push({ fromId: call.from, toId: call.to, report }, ...sink.after);
    if (call.asks) {
      const after = this.offers('after', call.to, call.effectId, call.hop, ran.results, sink.emitted, `${call.scope}:after`);
      if (after.length) {
        entries.push(...this.ask({
          key: `${call.scope}:after`, sheetId: call.to, window: 'after', label: call.label,
          offers: after, results: ran.results, preview: [],
        }, call.effectId, call.hop, sink.emitted, call.from).entries);
      }
    }
    return { results: ran.results, emitted: sink.emitted, report, entries };
  }
}
