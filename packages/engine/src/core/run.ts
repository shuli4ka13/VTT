import { compile } from '../formula/index.ts';
import { EngineError, isRuleError } from '../engine/errors.ts';
import { resolveRef, resolveNumber, resolveOptionalNumber, holdsNow } from '../engine/refs.ts';
import type { RefContext } from '../engine/refs.ts';
import { ownerOf, RECEIVER } from '../engine/owners.ts';
import { splitPath } from '../engine/navigate.ts';
import { findField, calc } from '../engine/calc.ts';
import { lapse } from '../events/durations.ts';
import { sweepBonds } from '../events/bonds.ts';
import { lifecycleChanges, HOOK_WORDS, HEARD_WORDS } from '../events/lifecycle.ts';
import { MOMENTS } from '../events/moments.ts';
import type { MomentKey } from '../events/moments.ts';
import { effectLabelOf } from '../events/actions.ts';
import { requireEffect, requireCalled, reapplyOf, usesMax } from '../engine/effects.ts';
import { expiryOf } from '../engine/clock.ts';
import { whoseOf, burnsUse } from '../events/durations.ts';
import { refusalWords } from '../events/refusal.ts';
import { tagsHold, rollName } from '../engine/roll-tags.ts';
import { answerSteps } from '../engine/steps/emit.ts';
import { CALL_NAME } from '../engine/modifiers.ts';
import { Views } from './view.ts';
import { State } from './state.ts';
import { limitsOf, CUT_WORDS } from './limits.ts';
import { gather, stack } from './edits.ts';
import { throwDice } from './roll.ts';
import { result, parse, withCount } from './dice.ts';
import { dieConstant } from '../engine/lead-die.ts';
import type { Check } from '../engine/check.ts';
import { subsOf, heard, same, instOf } from './subs.ts';
import { runnerOf } from './steps.ts';
import type { Clock } from '../engine/clock.ts';
import type { Pass } from '../engine/calc.ts';
import type { EmittedEvent, NestedRun } from '../engine/rule.ts';
import type { System, Sheet, Compendium, Step, Param, StoredValue, WornEffect, Die } from '../model/types.ts';
import type { External, Question, Offer } from './external.ts';
import type { Path, Window } from './path.ts';
import type { Report, Entry, Stop, Change } from './log.ts';
import type { Roll, RollResult, Spec } from './dice.ts';
import type { Thrown } from './roll.ts';
import type { Sub, ActionMoment, Hearing } from './subs.ts';
import type { Ctx, StepData, Prepared } from './steps.ts';

export interface World {
  system: System;
  compendium: Compendium;
  clock: Clock | null;
  sheets: readonly Sheet[];
}

export interface Sink {
  trace: Record<string, unknown>[];
  changes: Change[];
  effects: string[];
  removed: string[];
  spent: string[];
  emitted: EmittedEvent[];
  reactions: Report[];
  after: Entry[];
}

export const newSink = (): Sink => ({ trace: [], changes: [], effects: [], removed: [], spent: [], emitted: [], reactions: [], after: [] });

export function reportOf(kind: Report['kind'], effect: string, from: string, label: string, sink: Sink, stopped: Stop | null, reply: boolean): Report {
  return {
    kind, effect, from, label, reply, trace: sink.trace, stopped, changes: sink.changes,
    effects: sink.effects, removed: sink.removed, spent: sink.spent, emitted: sink.emitted,
    ...(sink.reactions.length ? { reactions: sink.reactions } : {}),
  };
}

export interface Memo {
  top: Frame;
  steps: Step[];
  stepIds: ReadonlySet<string>;
}

export interface Frame {
  path: Path;
  effectId: string;
  label: string;
  owner: string;
  here: string;
  names: string;
  sender: string;
  receiver: string | null;
  opponent: string | null;
  args: Record<string, unknown>;
  paramDefs: Param[];
  props: Record<string, unknown> | null;
  inputs?: Record<string, number | string>;
  claims: Readonly<Record<string, readonly string[]>>;
  actor: boolean;
  hop: number;
  source: string;
  alone?: boolean;
  bond?: { from: string; by: string };
  seenRoll?: { value: Roll };
  memo?: Memo;
}

export interface Ran {
  results: Record<string, unknown>;
  rolls: Record<string, RollResult>;
  stopped: Stop | null;
}

export interface Delivery {
  from: string;
  to: string;
  effectId: string;
  label: string;
  steps: Step[];
  path: Path;
  hop: number;
  top: boolean;
  seed?: Record<string, unknown>;
  args?: Record<string, unknown>;
  paramDefs?: Param[];
  props?: Record<string, unknown> | null;
  inputs?: Record<string, number | string>;
  claims?: Readonly<Record<string, readonly string[]>>;
  memo?: Memo;
  rolls?: Record<string, RollResult>;
}

export interface Delivered {
  call: Delivery;
  results: Record<string, unknown>;
  rolls: Record<string, RollResult>;
  emitted: EmittedEvent[];
  report: Report;
}

export class Limit extends Error {}

const withEvent = (results: Record<string, unknown>, event: EmittedEvent | undefined): Record<string, unknown> =>
  (event ? { ...results, event, event_amount: event.amount, event_incoming: event.incoming } : results);

const wornSeed = (entry: WornEffect): Record<string, unknown> => ({ carry: null, ...entry });

const labelOf = (sub: Sub): string => sub.effect.label || sub.effectId;

const truthy = (value: unknown): boolean =>
  value === true || (typeof value === 'number' && value !== 0) || (typeof value === 'string' && value !== '');

export class Run {
  readonly views: Views;
  readonly state: State;
  readonly limits;
  private readonly handlers: string[] = [];
  private readonly chain: string[] = [];
  private probing = 0;
  private seeing = 0;
  clock: Clock | null;

  constructor(readonly world: World, readonly ext: External) {
    this.clock = world.clock;
    this.views = new Views(world.system, world.compendium);
    this.limits = limitsOf(world.system);
    this.state = new State(world.sheets, this.limits.budget);
  }

  get system(): System { return this.world.system; }

  get isProbing(): boolean { return this.probing > 0; }

  sheet(id: string): Sheet | null {
    return this.views.sheet(this.state.sheets, id);
  }

  view(id: string): Pass {
    return this.views.of(this.state.sheets, id);
  }

  probe<T>(work: () => T): T {
    this.probing++;
    try {
      return this.state.probe(work);
    } finally {
      this.probing--;
    }
  }

  private spend(): void {
    this.state.budget -= 1;
    if (this.state.budget < 0) throw new Limit(CUT_WORDS);
  }

  exec(frame: Frame, steps: Step[], sink: Sink, seed: Record<string, unknown> = {}, within?: string, rolls: Record<string, RollResult> = {}): Ran {
    const results: Record<string, unknown> = { ...seed };
    const known: Record<string, RollResult> = { ...rolls };
    const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
    for (const [index, raw] of steps.entries()) {
      const step = raw as StepData;
      const name = step.id ?? index;
      const ctx = this.ctx(frame, results, known, frame.path.step(name), sink, stepIds);
      const mark = within ? { within } : {};
      if (!ctx.holds(step.when)) {
        sink.trace.push({ step: name, type: step.type, skipped: true, ...mark });
        continue;
      }
      const runner = runnerOf(step.type);
      let prepared: Prepared | undefined;
      if (runner.prepare && runner.once?.(step) && frame.memo) {
        const memo = this.memoized(frame.memo, index, sink);
        if (memo && 'skipped' in memo) {
          sink.trace.push({ step: name, type: step.type, skipped: true, ...mark });
          continue;
        }
        prepared = memo as Prepared;
      }
      const at = sink.trace.length;
      const out = runner.finish(step, ctx, prepared);
      sink.trace.splice(at, 0, { step: name, type: step.type, ...mark, ...out.trace });
      if (step.id != null) results[step.id] = out.value;
      if (step.id != null && out.roll) known[step.id] = out.roll;
      if (out.break) {
        return { results, rolls: known, stopped: { step: name, type: step.type, reason: out.break.reason, ...(out.break.note ? { note: out.break.note } : {}) } };
      }
    }
    return { results, rolls: known, stopped: null };
  }

  memoized(memo: Memo, index: number, sink: Sink): Prepared | { skipped: true } | null {
    const step = memo.steps[index] as StepData;
    const name = step.id ?? index;
    const path = memo.top.path.step(name);
    const cached = this.state.memo(path.key) as Prepared | { skipped: true } | undefined;
    if (cached) return cached;
    const summaries: Record<string, RollResult> = {};
    const values: Record<string, unknown> = {};
    memo.steps.slice(0, index).forEach((earlier, at) => {
      const id = (earlier as StepData).id;
      const done = this.state.memo(memo.top.path.step(id ?? at).key) as Prepared | undefined;
      if (id != null && done?.summary) summaries[id] = done.summary;
      if (id != null && done && 'value' in done) values[id] = done.value;
    });
    const own = newSink();
    const ctx = this.ctx(memo.top, values, summaries, path, own, memo.stepIds);
    let made: Prepared | { skipped: true };
    if (step.when !== undefined && step.when !== null && ctx.known(step.when) && !ctx.holds(step.when)) {
      made = { skipped: true };
    } else {
      made = runnerOf(step.type).prepare!(step, ctx);
    }
    this.state.remember(path.key, made);
    this.state.write(...own.after);
    sink.reactions.push(...own.reactions);
    return made;
  }

  private ctx(frame: Frame, results: Record<string, unknown>, rolls: Record<string, RollResult>, path: Path, sink: Sink, stepIds: ReadonlySet<string>, given?: Die): Ctx {
    const names = this.view(frame.names);
    const die = given ?? this.ext.dice(path);
    const ref: RefContext = {
      pass: names, die, owner: frame.owner, props: frame.props, paramDefs: frame.paramDefs, params: frame.args,
      ...(frame.inputs ? { inputs: frame.inputs } : {}),
      results, sender: rolls, stepIds,
      ...(frame.alone ? { alone: true } : {}),
      direct: { me: this.view(frame.sender), target: frame.receiver ? this.view(frame.receiver) : null, names },
    };
    let rollsMade = 0;
    const ctx = {
      system: this.system,
      owner: frame.owner,
      die,
      value: refValue => resolveRef(refValue, ref),
      known: refValue => this.known(refValue, frame, results, rolls, stepIds),
      number: (refValue, what) => {
        try {
          return resolveNumber(refValue, ref, what);
        } catch (err) {
          if (!(err instanceof EngineError) || !refValue || typeof refValue !== 'object') throw err;
          const r = refValue as { param?: unknown; expr?: unknown };
          const names = r.param !== undefined ? [String(r.param)] : r.expr !== undefined ? compile(String(r.expr)).deps : [];
          const formulas = names.flatMap(name => {
            const arg = frame.args[name];
            const text = typeof arg === 'string' ? arg : arg && typeof arg === 'object' && 'expr' in arg ? String((arg as { expr: unknown }).expr) : null;
            return text ? [`${name} = ${text}`] : [];
          });
          throw formulas.length ? new EngineError(`${err.message} — ${formulas.map(one => `«${one}»`).join(', ')}`) : err;
        }
      },
      optional: (refValue, what) => resolveOptionalNumber(refValue, ref, what),
      holds: guard => {
        if (guard === null || guard === undefined) return true;
        const value = resolveRef(guard, ref);
        if (typeof value !== 'boolean') throw new EngineError(`${frame.owner || 'правило'}: условие шага должно давать да/нет, а дало ${JSON.stringify(value)}`);
        return value;
      },
      roll: (side, spec, tags) => this.roll(frame, side, spec, tags, path.nth(rollsMade++), sink),
      read: tag => this.read(frame.here, tag),
      write: (tag, value) => this.write(frame.here, tag, value, sink),
      attach: (effectId, carry) => this.attach(frame, effectId, carry, sink, path),
      detach: effectId => this.detach(frame.here, effectId, frame.owner, sink),
      edited: (call, param, base, tags, args) =>
        stack(gather(this.view(frame.here), { call, param, tags, args }), base, `${call}.${param}`, args),
      call: (event, args, payload) => this.callEvent(frame, event, payload, args, sink, path, results),
      reply: (event, args) => this.reply(frame, event, args, sink, path),
      ...(frame.seenRoll ? { seenRoll: frame.seenRoll } : {}),
      using: (other: Die) => this.ctx(frame, results, rolls, path, sink, stepIds, other),
    } as Omit<Ctx, 'here'>;
    return Object.defineProperty(ctx, 'here', { get: () => this.view(frame.here), enumerable: true }) as Ctx;
  }

  private known(refValue: unknown, frame: Frame, results: Record<string, unknown>, rolls: Record<string, RollResult>, stepIds: ReadonlySet<string>): boolean {
    if (!refValue || typeof refValue !== 'object' || !('expr' in refValue)) return true;
    for (const name of compile(String((refValue as { expr: unknown }).expr)).deps) {
      const owned = ownerOf(name);
      if (owned) {
        if (owned.owner === RECEIVER && !frame.receiver) return false;
        continue;
      }
      const split = splitPath(name);
      const head = split?.head ?? name;
      if (!stepIds.has(head) || findField(this.system, name)) continue;
      const held = !split ? results[head] : head in results ? results[head] : rolls[head];
      if (held === undefined) return false;
      if (split && split.path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), held) === undefined) return false;
    }
    return true;
  }

  private roll(frame: Frame, side: 'sender' | 'target', spec: Spec, tags: string[], path: Path, sink: Sink): Thrown {
    const rollerId = side === 'sender' ? frame.names : (frame.receiver ?? frame.names);
    const pick = (...ids: (string | null | undefined)[]): string | null => ids.find(id => id && id !== rollerId) ?? null;
    const againstId = side === 'sender' ? pick(frame.opponent, frame.receiver, frame.sender) : pick(frame.names, frame.sender);
    return throwDice({
      spec, tags, claims: frame.claims[rollerId] ?? [],
      roller: this.view(rollerId),
      against: againstId && this.sheet(againstId) ? this.view(againstId) : null,
      die: this.ext.dice(path),
      seen: roll => this.seen(rollerId, againstId, roll, tags, path, frame.effectId, frame.hop, sink),
    });
  }

  private holder(sheetId: string, tag: string): string {
    const holder = this.views.holderOf(this.state.sheets, sheetId, tag);
    if (this.sheet(holder)) return holder;
    if (findField(this.system, tag)?.lives === 'group') return sheetId;
    throw new EngineError(`поле «${tag}» лежит на «${holder}», а такого листа здесь нет`);
  }

  private read(sheetId: string, tag: string): unknown {
    const sheet = this.sheet(this.holder(sheetId, tag))!;
    if (Object.prototype.hasOwnProperty.call(sheet.values, tag)) return sheet.values[tag];
    const field = findField(this.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
    return field.value.kind === 'stored' ? field.value.default : undefined;
  }

  private write(sheetId: string, tag: string, value: StoredValue, sink: Sink): void {
    const from = this.read(sheetId, tag);
    if (Object.is(from, value)) return;
    const holder = this.sheet(this.holder(sheetId, tag))!;
    sink.changes.push({ tag, from, to: value });
    this.state.put({ ...holder, values: { ...holder.values, [tag]: value } });
  }

  private attach(frame: Frame, effectId: string, carry: number | undefined, sink: Sink, path: Path): void {
    const effect = requireEffect(this.system, effectId, frame.owner);
    const sheet = this.sheet(frame.here)!;
    const worn: WornEffect[] = [...(sheet.effects ?? [])];
    const at = worn.findIndex(entry => entry.effectId === effectId);
    const fresh: WornEffect = {
      effectId,
      ...(carry !== undefined ? { carry } : {}),
      ...expiryOf(effect, this.clock),
      ...(whoseOf(effect) === 'source' && frame.source ? { from: frame.source } : {}),
      ...(frame.bond ? { from: frame.bond.from, by: frame.bond.by } : {}),
      ...(reapplyOf(effect) === 'stack' ? { inst: this.ext.id(path.phase('inst').phase(effectId)) } : {}),
    };
    const max = usesMax(effect);
    if (max !== null) fresh.usesLeft = max;
    if (at < 0) worn.push(fresh);
    else if (reapplyOf(effect) === 'refresh') worn[at] = fresh;
    else if (reapplyOf(effect) === 'stack') worn.push(fresh);
    else return;
    this.state.put({ ...sheet, effects: worn });
    if (!sink.effects.includes(effectId)) sink.effects.push(effectId);
  }

  private detach(sheetId: string, effectId: string, owner: string, sink: Sink): void {
    requireEffect(this.system, effectId, owner);
    const sheet = this.sheet(sheetId)!;
    const worn = (sheet.effects ?? []).filter(entry => entry.effectId !== effectId);
    if (worn.length === (sheet.effects ?? []).length) return;
    this.state.put({ ...sheet, effects: worn });
    sink.removed.push(effectId);
  }

  private callEvent(frame: Frame, event: string, payload: EmittedEvent, args: Record<string, unknown>, sink: Sink, path: Path, parent: Record<string, unknown>): NestedRun {
    const callee = requireCalled(this.system, event, frame.owner);
    if (this.chain.length >= this.limits.callDepth) {
      throw new EngineError(`${frame.owner || 'правило'}: вызовы вложены глубже ${this.limits.callDepth} — похоже, идут по кругу: ${[...this.chain, event].join(' → ')}`);
    }
    if (this.handlers.length) this.spend();
    sink.emitted.push(payload);
    this.chain.push(event);
    try {
      const at = path.call(event);
      const heardList = [payload];
      this.fire('targeted', 'event', frame.here, event, heardList, parent, frame.sender, at.phase('targeted'), frame.hop, sink);
      const inner: Frame = {
        path: at, effectId: event, label: callee.label || event, owner: `вызов «${callee.label || event}»`,
        here: frame.here, names: frame.here, sender: frame.sender, receiver: frame.here, opponent: null,
        args, paramDefs: callee.params ?? [], props: null, claims: {}, actor: false, hop: frame.hop, source: frame.source,
        ...(frame.bond ? { bond: frame.bond } : {}),
      };
      const ran = this.exec(inner, callee.steps ?? [], sink, { event: payload }, event);
      this.fire('affected', 'event', frame.here, event, heardList, parent, frame.sender, at.phase('affected'), frame.hop, sink);
      if (frame.actor) this.fire('acted', 'event', frame.sender, event, heardList, parent, frame.here, at.phase('acted'), frame.hop, sink);
      return { results: ran.results, stopped: ran.stopped };
    } finally {
      this.chain.pop();
    }
  }

  private reply(frame: Frame, event: string, args: Record<string, unknown>, sink: Sink, path: Path): void {
    if (frame.sender === frame.here) return;
    const effect = requireEffect(this.system, event, frame.owner);
    sink.after.push(...this.group([{
      from: frame.here, to: frame.sender, effectId: event, label: effect.label || event,
      steps: answerSteps({ event, args }) as Step[], path: path.phase('reply'), hop: frame.hop + 1, top: false,
    }]));
  }

  group(calls: Delivery[], delivered?: (out: Delivered, entries: Entry[]) => void): Entry[] {
    const entries: Entry[] = [];
    const done: Delivered[] = [];
    for (const call of calls) {
      if (!this.sheet(call.to)) continue;
      try {
        if (call.hop > 0) this.spend();
        const tried = this.probe(() => this.body(call, newSink()));
        const offers = this.offers('target', call.to, call.effectId, tried.results, tried.emitted, call.path.ask('target', call.to));
        if (offers.length) {
          entries.push(...this.ask({
            key: call.path.ask('target', call.to).key, sheetId: call.to, window: 'target', label: call.top ? '' : call.label,
            offers: offers.map(offer => offer.offer), results: tried.results, preview: call.top ? previewOf(this.system, tried) : [],
          }, offers, call.effectId, tried.emitted, call.from, call.hop, call.path.ask('target', call.to)));
        }
        const sink = newSink();
        const out = this.body(call, sink);
        entries.push({ fromId: call.from, toId: call.to, report: out.report }, ...sink.after);
        delivered?.(out, entries);
        done.push(out);
      } catch (err) {
        if (!(err instanceof Limit)) throw err;
        entries.push({ text: CUT_WORDS });
      }
    }
    for (const out of done) {
      const { call } = out;
      if (!this.sheet(call.to)) continue;
      const path = call.path.ask('after', call.to);
      const offers = this.offers('after', call.to, call.effectId, out.results, out.emitted, path);
      if (!offers.length) continue;
      entries.push(...this.ask({
        key: path.key, sheetId: call.to, window: 'after', label: call.top ? '' : call.label,
        offers: offers.map(offer => offer.offer), results: out.results, preview: [],
      }, offers, call.effectId, out.emitted, call.from, call.hop, path));
    }
    return entries;
  }

  body(call: Delivery, sink: Sink): Delivered {
    const effect = this.system.effects[call.effectId];
    const holder = effect?.bond && call.top ? (typeof effect.bond === 'string' ? effect.bond : call.effectId) : null;
    const frame: Frame = {
      path: call.path, effectId: call.effectId, label: call.label, owner: `конверт «${call.label}»`,
      here: call.to, names: call.from, sender: call.from, receiver: call.to, opponent: call.to,
      args: call.args ?? {}, paramDefs: call.paramDefs ?? [], props: call.props ?? null,
      ...(call.inputs ? { inputs: call.inputs } : {}),
      claims: call.claims ?? {}, actor: call.top, hop: call.hop, source: call.from,
      ...(holder ? { bond: { from: call.from, by: holder } } : {}),
      ...(call.memo ? { memo: call.memo } : {}),
    };
    this.fire('targeted', 'action', call.to, call.effectId, [], {}, call.from, call.path.phase('targeted'), call.hop, sink);
    const ran = this.exec(frame, call.steps, sink, call.seed ?? {}, undefined, call.rolls ?? {});
    this.fire('affected', 'action', call.to, call.effectId, sink.emitted, ran.results, call.from, call.path.phase('affected'), call.hop, sink);
    this.watch(call.effectId, sink.emitted, ran.results, call.from, call.to, call.path.phase('watch'), call.hop, sink);
    const report = reportOf('effect', call.effectId, call.from, call.label, sink, ran.stopped, call.hop > 0);
    return { call, results: ran.results, rolls: ran.rolls, emitted: sink.emitted, report };
  }

  fire(moment: ActionMoment, level: 'action' | 'event' | 'any', sheetId: string, effectId: string, emitted: readonly EmittedEvent[],
    seed: Record<string, unknown>, other: string | null, path: Path, hop: number, sink: Sink): void {
    const sheet = this.sheet(sheetId);
    if (!sheet) return;
    const hearing: Hearing = { kind: 'action', moment, level, effect: effectId, emitted, confirm: false, watch: false };
    for (const sub of subsOf(this.system, sheet, this.world.compendium)) {
      const got = heard(sub, hearing);
      if (!got) continue;
      const out = this.react(sub, {
        path: path.handler(sheetId, sub.key, sub.inst), seed: withEvent(seed, got.event), other, hop, chosen: false,
        owner: `триггер «${labelOf(sub)}»`,
      });
      if (out.report) sink.reactions.push(out.report);
      if (out.spent) sink.spent.push(out.spent);
      sink.after.push(...out.lead, ...out.entries);
    }
  }

  private watch(effectId: string, emitted: readonly EmittedEvent[], seed: Record<string, unknown>,
    actorId: string, targetId: string, path: Path, hop: number, sink: Sink): void {
    const hearing: Hearing = { kind: 'action', moment: 'affected', level: 'action', effect: effectId, emitted, confirm: false, watch: true };
    for (const sheet of [...this.state.sheets]) {
      if (sheet.id === actorId || sheet.id === targetId) continue;
      const live = this.sheet(sheet.id);
      if (!live) continue;
      for (const sub of subsOf(this.system, live, this.world.compendium)) {
        const got = heard(sub, hearing);
        if (!got) continue;
        const out = this.react(sub, {
          path: path.handler(sheet.id, sub.key, sub.inst),
          seed: { ...withEvent(seed, got.event), [CALL_NAME]: { я: actorId, цель: targetId } },
          other: actorId, hop, chosen: false, owner: `триггер «${labelOf(sub)}»`,
        });
        if (out.report) sink.reactions.push(out.report);
        sink.after.push(...out.lead, ...out.entries);
      }
    }
  }

  private live(sub: Sub): Sub | null {
    const sheet = this.sheet(sub.sheetId);
    return sheet ? subsOf(this.system, sheet, this.world.compendium).find(other => same(other, sub)) ?? null : null;
  }

  private holds(sub: Sub, seed: Record<string, unknown>): boolean {
    try {
      return holdsNow(sub.handler.if, { pass: this.view(sub.sheetId), results: seed, owner: `триггер «${labelOf(sub)}»` });
    } catch (err) {
      if (!isRuleError(err)) throw err;
      return false;
    }
  }

  private selfFrame(sub: Sub, path: Path, hop: number, owner: string, roll?: { value: Roll }): Frame {
    return {
      path, effectId: sub.effectId, label: labelOf(sub), owner,
      here: sub.sheetId, names: sub.sheetId, sender: sub.sheetId, receiver: sub.sheetId, opponent: null,
      args: (sub.effect.args || {}) as Record<string, unknown>, paramDefs: sub.effect.params ?? [], props: null,
      claims: {}, actor: false, hop, source: sub.sheetId, ...(roll ? { seenRoll: roll } : {}),
    };
  }

  private pay(sub: Sub, path: Path, seed: Record<string, unknown>, hop: number): { why: string | null; report: Report; changed: boolean } {
    const own = newSink();
    const ran = this.exec(this.selfFrame(sub, path, hop, `плата за «${labelOf(sub)}»`), sub.handler.cost ?? [], own, seed);
    const report = reportOf('effect', sub.effectId, sub.sheetId, labelOf(sub), own, ran.stopped, false);
    return { why: refusalWords(report, this.system), report, changed: own.changes.length > 0 || own.effects.length > 0 || own.removed.length > 0 };
  }

  refusal(sub: Sub, path: Path, seed: Record<string, unknown>, hop: number): string | null {
    if (!sub.handler.cost?.length) return null;
    return this.probe(() => this.pay(sub, path, seed, hop).why);
  }

  react(found: Sub, o: {
    path: Path; seed: Record<string, unknown> | (() => Record<string, unknown>); other: string | null; hop: number;
    chosen: boolean; owner: string; roll?: { value: Roll }; builtin?: boolean; kind?: Report['kind']; label?: string;
  }): { lead: Entry[]; report?: Report; entries: Entry[]; spent?: string } {
    const entries: Entry[] = [];
    const lead: Entry[] = [];
    const label = o.label ?? labelOf(found);
    const sub = o.builtin ? found : this.live(found);
    if (!sub) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: эффекта уже нет` });
      return { lead, entries };
    }
    const seed = { ...(typeof o.seed === 'function' ? o.seed() : o.seed), worn: wornSeed(sub.entry) };
    if (!this.holds(sub, seed)) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: условие уже не выполняется` });
      return { lead, entries };
    }
    const mark = sub.key;
    if (this.handlers.filter(one => one === mark).length >= this.limits.handlerDepth) {
      return { lead, entries: [{ text: CUT_WORDS }] };
    }
    const why = o.builtin ? null : this.refusal(sub, o.path.pay(), seed, o.hop);
    if (why) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: ${why}` });
      return { lead, entries };
    }
    this.state.begin();
    this.handlers.push(mark);
    try {
      let report: Report | undefined;
      if (!o.builtin && sub.handler.cost?.length) {
        const paid = this.pay(sub, o.path.pay(), seed, o.hop);
        if (paid.why) {
          this.state.rollback();
          return { lead, entries: [{ text: `«${label}» не состоялось: ${paid.why}` }] };
        }
        if (paid.changed) lead.push({ fromId: sub.sheetId, toId: sub.sheetId, report: paid.report });
      }
      if (sub.handler.to === 'other') {
        if (o.other) {
          entries.push(...this.group([{
            from: sub.sheetId, to: o.other, effectId: sub.effectId, label, steps: sub.handler.steps ?? [],
            path: o.path, hop: o.hop + 1, top: false, seed,
            args: (sub.effect.args || {}) as Record<string, unknown>, paramDefs: sub.effect.params ?? [],
          }]));
        }
      } else {
        const own = newSink();
        const ran = this.exec(this.selfFrame(sub, o.path, o.hop, o.owner, o.roll), sub.handler.steps ?? [], own, seed);
        report = reportOf(o.kind ?? 'effect', sub.effectId, sub.sheetId, label, own, ran.stopped, false);
        entries.push(...own.after);
      }
      const spent = !o.builtin && burnsUse(sub.effect);
      if (spent) this.burn(sub);
      this.state.commit();
      return { lead, ...(report ? { report } : {}), entries, ...(spent ? { spent: sub.effectId } : {}) };
    } catch (err) {
      if (!(err instanceof Limit)) {
        this.state.rollback();
        throw err;
      }
      this.state.rollback();
      return { lead: [], entries: [{ text: CUT_WORDS }] };
    } finally {
      this.handlers.pop();
    }
  }

  private burn(sub: Sub): void {
    const sheet = this.sheet(sub.sheetId);
    if (!sheet) return;
    const counts = new Map<string, number>();
    const effects: WornEffect[] = [];
    for (const entry of sheet.effects ?? []) {
      const nth = counts.get(entry.effectId) ?? 0;
      counts.set(entry.effectId, nth + 1);
      if (entry.effectId !== sub.effectId || instOf(entry, false, nth) !== sub.inst) { effects.push(entry); continue; }
      const left = Number(entry.usesLeft ?? 1) - 1;
      if (left > 0) effects.push({ ...entry, usesLeft: left });
    }
    this.state.put({ ...sheet, effects });
  }

  moment(moment: MomentKey, sheetId: string, path: Path): void {
    const lapsed = lapse({ moment, sheetId }, [...this.state.sheets], this.system, this.clock);
    this.state.replace(lapsed.sheets);
    for (const gone of lapsed.expired) {
      this.state.write({ text: `«${effectLabelOf(this.system, gone.effectId)}» спало с ${this.sheet(gone.sheetId)?.name ?? gone.sheetId}` });
    }
    const sheet = this.sheet(sheetId);
    if (!sheet) return;
    const seed = { moment: { moment, sheet: sheetId, round: this.clock?.round ?? 0 } };
    for (const sub of subsOf(this.system, sheet, this.world.compendium)) {
      if (!heard(sub, { kind: 'moment', moment })) continue;
      this.momentReact(sub, path.phase(moment).handler(sheetId, sub.key, sub.inst), seed,
        `момент «${MOMENTS[moment]}» у «${labelOf(sub)}»`, labelOf(sub));
    }
  }

  private momentReact(sub: Sub, path: Path, seed: Record<string, unknown>, owner: string, label: string, builtin = false): void {
    const out = this.react(sub, { path, seed, other: null, hop: 0, chosen: false, owner, kind: 'moment', label, builtin });
    const nested = [...out.lead, ...out.entries];
    const folded = nested.flatMap(entry => ('report' in entry ? [entry.report] : []));
    if (out.report) {
      this.state.write({
        fromId: sub.sheetId, toId: sub.sheetId,
        report: folded.length ? { ...out.report, reactions: [...(out.report.reactions ?? []), ...folded] } : out.report,
      });
    }
    this.state.write(...nested.filter(entry => !('report' in entry)));
  }

  settle(before: readonly Sheet[], path: Path): void {
    let hookedFrom = [...before];
    let crossedFrom = [...before];
    for (let round = 0; round < this.limits.settleRounds; round += 1) {
      const at = path.phase('settle').nth(round);
      this.lifecycle(hookedFrom, at.phase('life'));
      hookedFrom = [...this.state.sheets];
      const crossed = this.crossings(crossedFrom, at.phase('cross'));
      crossedFrom = [...this.state.sheets];
      const swept = sweepBonds(this.system, [...this.state.sheets]);
      this.state.replace(swept.sheets);
      for (const broken of swept.broken) {
        this.state.write({ text: `«${effectLabelOf(this.system, broken.effectId)}» спало с ${this.sheet(broken.sheetId)?.name ?? broken.sheetId}: держать стало нечем` });
      }
      if (!crossed && !swept.broken.length) return;
    }
    throw new EngineError(`наложения, поля и связи будят друг друга без остановки: больше ${this.limits.settleRounds} кругов`);
  }

  private lifecycle(from: Sheet[], path: Path): void {
    let previous = from;
    for (let wave = 0; ; wave += 1) {
      if (wave > this.limits.settleRounds * 4) throw new EngineError('наложения и спадания будят друг друга без остановки');
      const changes = lifecycleChanges(previous, [...this.state.sheets], { system: this.system, compendium: this.world.compendium, die: () => 1 });
      previous = [...this.state.sheets];
      if (!changes.length) return;
      for (const [n, change] of changes.entries()) {
        const effect = this.system.effects[change.entry.effectId];
        if (!effect) continue;
        const live = this.sheet(change.sheetId);
        if (!live) continue;
        const name = effect.label ?? change.entry.effectId;
        const own = effect[change.turn];
        const inst = (change.entry as { inst?: string }).inst ?? `${change.entry.effectId}@${n}`;
        const at = path.nth(wave).phase(change.turn).at(change.sheetId).phase(change.entry.effectId);
        if (own?.length) {
          const hook: Sub = {
            sheetId: change.sheetId, effectId: change.entry.effectId, effect, entry: change.entry, inst,
            handler: { on: change.turn, steps: own } as Sub['handler'], key: `${change.entry.effectId}:${change.turn}`,
          };
          this.momentReact(hook, at.phase('hook'), {}, `«${name}» ${HOOK_WORDS[change.turn]}`, `${name} · ${HOOK_WORDS[change.turn]}`, true);
        }
        const hearing: Hearing = change.turn === 'attach' ? { kind: 'gained', effect: change.entry.effectId } : { kind: 'lost', effect: change.entry.effectId };
        const sheet = this.sheet(change.sheetId);
        if (!sheet) continue;
        for (const sub of subsOf(this.system, sheet, this.world.compendium)) {
          if (!heard(sub, hearing)) continue;
          this.momentReact(sub, at.handler(change.sheetId, sub.key, sub.inst), { about: { carry: null, ...change.entry } },
            `«${name}» ${HEARD_WORDS[change.turn]} у «${labelOf(sub)}»`, labelOf(sub));
        }
      }
    }
  }

  private crossings(from: Sheet[], path: Path): boolean {
    let previous = from;
    let any = false;
    for (let wave = 0; ; wave += 1) {
      if (wave > this.limits.settleRounds * 4) throw new EngineError('поля будят эффекты без остановки');
      const now = [...this.state.sheets];
      const found: { sub: Sub; tag: string; value: unknown }[] = [];
      for (const sheet of now) {
        const was = previous.find(s => s.id === sheet.id);
        if (!was || was === sheet) continue;
        for (const sub of subsOf(this.system, sheet, this.world.compendium)) {
          const tag = sub.handler.on?.startsWith('field:') ? sub.handler.on.slice('field:'.length) : null;
          if (!tag) continue;
          const after = this.valueIn(now, sheet.id, tag);
          if (!truthy(after) || truthy(this.valueIn(previous, sheet.id, tag))) continue;
          found.push({ sub, tag, value: after });
        }
      }
      previous = now;
      if (!found.length) return any;
      any = true;
      for (const { sub, tag, value } of found) {
        const label = findField(this.system, tag)?.label ?? tag;
        this.momentReact(sub, path.nth(wave).handler(sub.sheetId, sub.key, sub.inst), { field: { tag, value } },
          `поле «${label}» стало верным у «${labelOf(sub)}»`, labelOf(sub));
      }
    }
  }

  private valueIn(sheets: readonly Sheet[], sheetId: string, tag: string): unknown {
    try {
      return calc(this.system, this.views.sheet(sheets, sheetId)!, tag, this.views.of(sheets, sheetId));
    } catch (err) {
      if (isRuleError(err)) return undefined;
      throw err;
    }
  }

  check(sheetId: string, check: Check, path: Path, owner: string): { thrown: Thrown; bonus: number; total: number; entries: Entry[] } {
    const frame: Frame = {
      path, effectId: '', label: owner, owner, here: sheetId, names: sheetId, sender: sheetId, receiver: sheetId, opponent: null,
      args: {}, paramDefs: [], props: null, claims: {}, actor: false, hop: 0, source: sheetId,
    };
    const sink = newSink();
    const ctx = this.ctx(frame, {}, {}, path, sink, new Set());
    const spec = parse(dieConstant(this.system, check.die.constant), (ref, what) => ctx.number(ref, what));
    const sized = check.count === undefined || check.count === null ? spec : withCount(spec, ctx.number(check.count, `${owner} · сколько костей`), owner);
    const thrown = ctx.roll('sender', sized, [...(check.tags ?? [])]);
    const bonus = (check.bonus ? ctx.optional(check.bonus, `${owner} · прибавка`) ?? 0 : 0) + thrown.bonus;
    return { thrown, bonus, total: thrown.result.total + bonus, entries: sink.after };
  }

  private choose(question: Question): { chosen: string[]; skipped: boolean } {
    const { chosen, byPerson } = this.isProbing
      ? { chosen: this.ext.peek(question.key) ?? [], byPerson: false }
      : this.ext.ask(question);
    const unique = [...new Set(chosen)];
    const stray = unique.find(id => !question.offers.some(offer => offer.id === id));
    if (stray) throw new EngineError(`реакция «${stray}» сейчас не предлагается; можно: ${question.offers.map(o => o.id).join(', ') || '(ничего)'}`);
    return { chosen: unique, skipped: byPerson && !unique.length };
  }

  offers(window: 'target' | 'after', sheetId: string, effectId: string, results: Record<string, unknown>,
    emitted: readonly EmittedEvent[], path: Path): { offer: Offer; subs: { sub: Sub; event?: EmittedEvent }[] }[] {
    const sheet = this.sheet(sheetId);
    if (!sheet) return [];
    const hearing: Hearing = { kind: 'action', moment: window === 'target' ? 'targeted' : 'affected', level: 'any', effect: effectId, emitted, confirm: true, watch: false };
    const byKey = new Map<string, { offer: Offer; subs: { sub: Sub; event?: EmittedEvent }[] }>();
    for (const sub of subsOf(this.system, sheet, this.world.compendium)) {
      const got = heard(sub, hearing);
      if (!got) continue;
      const seed = { ...withEvent(results, got.event), worn: wornSeed(sub.entry) };
      if (!this.holds(sub, seed)) continue;
      if (this.refusal(sub, path.pick(sub.key).pay(), seed, 0)) continue;
      const known = byKey.get(sub.key);
      if (known) known.subs.push({ sub, ...(got.event ? { event: got.event } : {}) });
      else byKey.set(sub.key, { offer: { id: sub.key, label: labelOf(sub) }, subs: [{ sub, ...(got.event ? { event: got.event } : {}) }] });
    }
    return [...byKey.values()];
  }

  ask(question: Question, offers: { offer: Offer; subs: { sub: Sub; event?: EmittedEvent }[] }[], _effectId: string,
    _emitted: readonly EmittedEvent[], other: string | null, hop: number, path: Path): Entry[] {
    const { chosen, skipped } = this.choose(question);
    const entries: Entry[] = [];
    for (const id of chosen) {
      const found = offers.find(offer => offer.offer.id === id)!;
      const pick = found.subs.find(({ sub }) => this.live(sub)) ?? found.subs[0]!;
      const out = this.react(pick.sub, {
        path: path.pick(id), seed: withEvent(question.results, pick.event), other, hop, chosen: true,
        owner: `реакция «${labelOf(pick.sub)}»`,
      });
      entries.push(...out.lead);
      if (out.report) entries.push({ fromId: pick.sub.sheetId, toId: pick.sub.sheetId, report: out.report });
      entries.push(...out.entries);
    }
    if (skipped) entries.push({ text: `${this.sheet(question.sheetId)?.name ?? question.sheetId} пропускает реакцию` });
    return entries;
  }

  seen(rollerId: string, againstId: string | null, roll: Roll, tags: readonly string[], path: Path,
    effectId: string, hop: number, sink: Sink): Roll {
    if (this.seeing) return roll;
    const cell = { value: roll };
    const seed = (): Record<string, unknown> => {
      const now = result(cell.value);
      return {
        [CALL_NAME]: { я: rollerId, цель: againstId },
        roll: {
          total: now.total, natural: now.natural, plus: cell.value.plus, rolls: now.dice.rolls, kept: now.dice.kept, parts: now.parts,
          rolled: now.rolled, atMax: now.atMax, atMin: now.atMin, edited: now.edited, tags: [...tags],
        },
      };
    };
    this.seeing++;
    try {
      const against = againstId !== rollerId ? againstId : null;
      const sides: [string, 'against' | undefined, boolean][] = [
        [rollerId, undefined, false],
        ...(against ? [[against, 'against', false] as [string, 'against', boolean]] : []),
        ...this.state.sheets.filter(s => s.id !== rollerId && s.id !== against).map((s): [string, undefined, boolean] => [s.id, undefined, true]),
      ];
      for (const [sheetId, as, watch] of sides) {
        const listening = (confirm: boolean): Sub[] => {
          const sheet = this.sheet(sheetId);
          if (!sheet) return [];
          const hearing: Hearing = { kind: 'action', moment: 'seen', level: 'any', effect: effectId, emitted: [], confirm, watch };
          return subsOf(this.system, sheet, this.world.compendium)
            .filter(sub => heard(sub, hearing) && (watch || sub.handler.as === as) && tagsHold(sub.handler.tags, tags));
        };
        for (const sub of listening(false)) {
          const out = this.react(sub, {
            path: path.phase('seen').handler(sheetId, sub.key, sub.inst), seed, other: null, hop, chosen: false,
            owner: `«${labelOf(sub)}» — увидев кости`, roll: cell,
          });
          sink.after.push(...out.lead);
          if (out.report) sink.after.push({ fromId: sheetId, toId: sheetId, report: out.report });
          sink.after.push(...out.entries);
        }
        const qpath = path.ask('seen', sheetId);
        const byKey = new Map<string, { offer: Offer; subs: { sub: Sub }[] }>();
        for (const sub of listening(true)) {
          const full = { ...seed(), worn: wornSeed(sub.entry) };
          if (!this.holds(sub, full) || this.refusal(sub, qpath.pick(sub.key).pay(), full, hop)) continue;
          const known = byKey.get(sub.key);
          if (known) known.subs.push({ sub });
          else byKey.set(sub.key, { offer: { id: sub.key, label: labelOf(sub) }, subs: [{ sub }] });
        }
        if (!byKey.size) continue;
        const now = result(cell.value);
        const question: Question = {
          key: qpath.key, sheetId, window: 'seen', label: '', offers: [...byKey.values()].map(one => one.offer), results: seed(),
          preview: [`${tags.length ? `Бросок (${rollName([...tags])})` : 'Бросок'}: [${now.dice.rolls.join(', ')}] → ${now.total}`],
        };
        const { chosen, skipped } = this.choose(question);
        for (const id of chosen) {
          const found = byKey.get(id)!;
          const pick = found.subs.find(({ sub }) => this.live(sub)) ?? found.subs[0]!;
          const out = this.react(pick.sub, {
            path: qpath.pick(id), seed, other: null, hop, chosen: true, owner: `«${labelOf(pick.sub)}» — увидев кости`, roll: cell,
          });
          sink.after.push(...out.lead);
          if (out.report) sink.after.push({ fromId: sheetId, toId: sheetId, report: out.report });
          sink.after.push(...out.entries);
        }
        if (skipped) sink.after.push({ text: `${this.sheet(sheetId)?.name ?? sheetId} пропускает реакцию` });
      }
    } finally {
      this.seeing--;
    }
    return cell.value;
  }
}

function previewOf(system: System, tried: Delivered): string[] {
  const lines: string[] = [];
  for (const trace of tried.report.trace) {
    if (trace.type !== 'threshold' || trace.skipped || trace.within) continue;
    const rolls = trace.kept != null && Array.isArray(trace.rolls) && trace.rolls.length > 1
      ? `[${(trace.rolls as number[]).join(', ')}] → ${trace.kept}` : `[${((trace.rolls as number[]) ?? []).join(', ')}]`;
    const versus = trace.versus as { tag?: string; value?: number } | undefined;
    const named = versus?.tag ? findField(system, versus.tag)?.label ?? versus.tag : 'порог';
    lines.push(`Бросок: ${rolls} + ${trace.bonus ?? 0} = ${trace.total} против ${named} ${versus?.value}: ${trace.success ? 'попадание' : 'промах'}`);
  }
  return lines;
}

export type { Window };
