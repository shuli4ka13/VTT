import { NAMES } from '../words/names.ts';
import { paramStages } from '../engine/stages.ts';
import { compile, printFormula } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { EngineError, isRuleError } from '../engine/errors.ts';
import { resolveRef, resolveNumber, resolveOptionalNumber, holdsNow, sheetHead } from '../engine/refs.ts';
import type { RefContext, Bound } from '../engine/refs.ts';
import { splitPath, referencedTable, reach } from '../engine/navigate.ts';
import { findField, calc, baseOf } from '../engine/calc.ts';
import { lapse, leftOf, LEFT_NAME } from '../events/durations.ts';
import { sweepBonds, freeHolders } from '../events/bonds.ts';
import { lifecycleChanges, HOOK_WORDS, HEARD_WORDS } from '../events/lifecycle.ts';
import { MOMENTS } from '../events/moments.ts';
import { ROLLED, ROLLED_LABEL } from '../events/happenings.ts';
import type { MomentKey } from '../events/moments.ts';
import { effectLabelOf } from '../events/actions.ts';
import { requireEffect, requireCalled, reapplyOf, usesMax } from '../engine/effects.ts';
import { tagsFit } from '../engine/roll-tags.ts';
import { expiryOf, inCombat } from '../engine/clock.ts';
import { burnsUse } from '../events/durations.ts';
import { refusalWords } from '../events/refusal.ts';
import { rollTitle } from '../engine/roll-tags.ts';
import { previewLines } from '../events/describe.ts';
import { isDesk, DESK_ID } from '../engine/owners.ts';
import { Views } from './view.ts';
import { State } from './state.ts';
import { limitsOf, CUT_WORDS, PROBES_WORDS } from './limits.ts';
import { gather, stack, rollHeld, rollMarks, amountOf, wordApplies, THRESHOLD_PARAM } from './edits.ts';
import { ROLL_CALL, CALL_WORDS } from '../words/calls.ts';
import { recordOf, retarget, opponentIn, mentions } from './against.ts';
import type { Faced, Names } from './against.ts';
import type { Holder } from './edits.ts';
import { throwDice } from './roll.ts';
import { result, parse, withCount, withSides, withKeep, start, addendsText } from './dice.ts';
import { dieConstant } from '../engine/lead-die.ts';
import { ROLLED_NAME, ROLL_NAME, NUMBER_NAME, THRESHOLD_NAME, SUCCESS_NAME, MARGIN_NAME } from '../engine/check.ts';
import type { Check, FieldThrow } from '../engine/check.ts';
import { lookupDegree } from '../engine/tables.ts';
import { subsOf, same, instOf, keysOf } from './subs.ts';
import { same as sameValue, hasField, rowKeyOf } from '../model/sheet-columns.ts';
import { runnerOf, calledBy } from './steps.ts';
import type { Clock } from '../engine/clock.ts';
import type { Pass } from '../engine/calc.ts';
import type { EmittedEvent, NestedRun } from '../engine/rule.ts';
import type { System, Sheet, Compendium, Step, Param, StoredValue, WornEffect, Die, Effect } from '../model/types.ts';
import { Pause } from './external.ts';
import { ASK_ONE_WORDS, ASK_ROLLED } from '../words/steps.ts';
import type { External, Question, Offer } from './external.ts';
import type { Path, Window } from './path.ts';
import type { Report, Entry, Stop, Change } from './log.ts';
import type { Roll, RollResult, Spec } from './dice.ts';
import type { Thrown } from './roll.ts';
import type { Sub } from './subs.ts';
import type { Ctx, StepData, FieldRef } from './steps.ts';
import { tagWords } from '../engine/roll-tags.ts';
import { ITEM_NAME, asItem, itemColumn, itemStored, itemTag, parseItemTag, withItemValue } from '../model/item-ref.ts';
import type { ItemRef } from '../model/item-ref.ts';

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

export type Claims = Readonly<Record<string, readonly string[]>>;

export interface Lazy {
  frame: Frame;
  steps: Map<string, { step: StepData; index: number }>;
  stepIds: ReadonlySet<string>;
}

export interface Frame {
  path: Path;
  effectId: string;
  label: string;
  owner: string;
  home: string;
  bound: Record<string, Bound> | null;
  args: Record<string, unknown>;
  paramDefs: Param[];
  props: Record<string, unknown> | null;
  item?: ItemRef;
  inputs?: Record<string, number | string>;
  claims: Claims;
  hop: number;
  inSub: boolean;
  bond?: WornEffect['bond'];
  seenRoll?: { value: Roll; bonus?: number };
  lazy?: Lazy;
  alone?: boolean;
  cost?: boolean;
  offset?: number;
}

export interface Ran {
  results: Record<string, unknown>;
  rolls: Record<string, RollResult>;
  stopped: Stop | null;
}

const stepIdsOf = (steps: readonly Step[]): string[] =>
  steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== '');

export interface Delivery {
  effectId: string;
  label: string;
  steps: Step[];
  path: Path;
  hop: number;
  top: boolean;
  home: string;
  subject: string | null;
  bound: Record<string, Bound>;
  keys: readonly string[];
  seed?: Record<string, unknown>;
  rolls?: Record<string, RollResult>;
  args?: Record<string, unknown>;
  paramDefs?: Param[];
  props?: Record<string, unknown> | null;
  item?: ItemRef;
  inputs?: Record<string, number | string>;
  claims?: Claims;
  lazy?: Lazy;
  bond?: WornEffect['bond'];
  offset?: number;
  lead?: Record<string, unknown>[];
  cost?: boolean;
}

export interface Delivered {
  call: Delivery;
  returns?: Record<string, unknown>;
  results: Record<string, unknown>;
  rolls: Record<string, RollResult>;
  emitted: EmittedEvent[];
  report: Report;
}

export interface Hearing {
  keys: readonly string[];
  names: Record<string, Bound>;
  seed: Record<string, unknown> | (() => Record<string, unknown>);
  rolls?: Record<string, RollResult>;
  path: Path;
  hop: number;
  owner: (sub: Sub) => string;
  roll?: { value: Roll; bonus?: number };
  kind?: Report['kind'];
}

interface Pick { sub: Sub; names: Record<string, Bound>; seed: Record<string, unknown>; rolls: Record<string, RollResult> }

interface OfferFound { offer: Offer; picks: Pick[] }

export class Limit extends Error {}

const labelOf = (sub: Sub): string => sub.effect.label || sub.effectId;

const truthy = (value: unknown): boolean =>
  value === true || (typeof value === 'number' && value !== 0) || (typeof value === 'string' && value !== '');

const sheetParams = (params: readonly Param[] | undefined): Set<string> =>
  new Set((params ?? []).filter(param => param.kind === 'sheet').map(param => param.key));

export function namesOf(params: readonly Param[] | undefined, args: Record<string, unknown>): Record<string, Bound> {
  const names: Record<string, Bound> = {};
  for (const key of sheetParams(params)) {
    const value = args[key];
    names[key] = Array.isArray(value) ? value.map(String) : value === undefined || value === null || value === '' ? null : String(value);
  }
  return names;
}

function rollsOf(params: readonly Param[] | undefined, args: Record<string, unknown>): Record<string, RollResult> {
  return Object.fromEntries((params ?? []).filter(p => p.kind === 'roll' && args[p.key] && typeof args[p.key] === 'object')
    .map(p => [p.key, args[p.key] as RollResult]));
}

const totalsOf = (rolls: Record<string, RollResult>): Record<string, number> =>
  Object.fromEntries(Object.entries(rolls).map(([key, roll]) => [key, Number((roll as unknown as { total: number }).total)]));

function valuesOf(params: readonly Param[] | undefined, args: Record<string, unknown>): Record<string, unknown> {
  const sheets = sheetParams(params);
  return Object.fromEntries(Object.entries(args).filter(([key]) => !sheets.has(key)));
}

interface ShownBonus { label: string | null; value: number }

export class Run {
  readonly views: Views;
  readonly state: State;
  readonly limits;
  private readonly handlers: string[] = [];
  private readonly running: Sub[] = [];
  private readonly chain: string[] = [];
  private probing = 0;
  private seenAsks = 0;
  private seeing = 0;
  private readonly insts = new WeakMap<WornEffect, string>();
  private readonly holding = new Map<string, Record<string, StoredValue>>();
  private mark: { sink: Sink; at: number; count: number } | null = null;
  clock: Clock | null;

  constructor(readonly world: World, readonly ext: External) {
    this.clock = world.clock;
    for (const sheet of world.sheets) {
      const counts = new Map<string, number>();
      for (const entry of sheet.effects ?? []) {
        const nth = counts.get(entry.effectId) ?? 0;
        counts.set(entry.effectId, nth + 1);
        this.insts.set(entry, instOf(entry, false, nth));
      }
    }
    this.views = new Views(world.system, world.compendium, () => inCombat(this.clock), () => this.clock?.round ?? null);
    this.limits = limitsOf(world.system);
    this.state = new State(world.sheets, this.limits.budget);
  }

  get system(): System { return this.world.system; }

  readonly instOf = (entry: WornEffect, granted: boolean, nth: number): string =>
    (typeof (entry as { inst?: unknown }).inst === 'string' && (entry as { inst?: string }).inst) || (granted ? `+${entry.effectId}` : this.insts.get(entry) ?? `${entry.effectId}@${nth}`);

  subs(sheet: Sheet): Sub[] {
    return subsOf(this.system, sheet, this.world.compendium, this.instOf);
  }

  private instIn(sheets: readonly Sheet[], sheetId: string, entry: WornEffect): string {
    const list = sheets.find(s => s.id === sheetId)?.effects ?? [];
    const nth = list.filter(other => other.effectId === entry.effectId).indexOf(entry);
    return this.instOf(entry, false, Math.max(0, nth));
  }

  get isProbing(): boolean { return this.probing > 0; }

  sheet(id: string): Sheet | null {
    return this.views.sheet(this.state.sheets, id);
  }

  view(id: string): Pass {
    return this.views.of(this.state.sheets, id);
  }

  holders(): Sheet[] {
    const sheets = this.state.sheets;
    const shared = this.views.shared(sheets);
    const desk = shared.find(isDesk) ?? sheets.find(isDesk);
    const groups = sheets.filter(sheet => !isDesk(sheet) && sheets.some(other => other.group === sheet.id));
    const rest = sheets.filter(sheet => !isDesk(sheet) && !groups.includes(sheet));
    return [...(desk ? [desk] : []), ...groups, ...rest];
  }

  private holderViews(): Holder[] {
    return this.holders().map(sheet => ({ id: sheet.id, view: this.view(sheet.id) }));
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
    const stepIds = new Set([
      ...steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''),
      ...(frame.lazy?.stepIds ?? []),
    ]);
    const blocks: { outer: boolean; taken: boolean; active: boolean }[] = [];
    for (const [index, raw] of steps.entries()) {
      const step = raw as StepData;
      const name = step.id ?? (frame.offset ?? 0) + index;
      const ctx = this.ctx(frame, results, known, frame.path.step(name), sink, stepIds, undefined, { steps, index });
      const mark = within ? { within } : {};
      const flow = runnerOf(step.type).flow;
      const live = blocks.every(block => block.active);
      if (flow === 'open') {
        const hit = live && ctx.holds(step.if);
        blocks.push({ outer: live, taken: hit, active: hit });
        continue;
      }
      if (flow === 'alt') {
        const block = blocks[blocks.length - 1];
        if (!block) continue;
        const hit = block.outer && !block.taken && (step.if === undefined || ctx.holds(step.if));
        block.active = hit;
        block.taken ||= hit;
        continue;
      }
      if (flow === 'close') {
        blocks.pop();
        continue;
      }
      if (!live || !ctx.holds(step.if)) {
        sink.trace.push({ step: name, type: step.type, skipped: true, ...mark });
        continue;
      }
      const rows = runnerOf(step.type).rows?.(step);
      if (rows) {
        if (blocks.length) throw new EngineError(`${frame.owner || 'правило'}: «для каждой строки» не ставится внутрь «Если»`);
        sink.trace.push({ step: name, type: step.type, table: rows.table, ...mark });
        for (const row of this.rowsOf(frame, rows)) {
          const inner: Frame = {
            ...frame,
            path: frame.path.step(name).item(row.key),
            offset: (frame.offset ?? 0) + index + 1,
            paramDefs: [...frame.paramDefs.filter(param => param.key !== rows.as), row.param],
            args: { ...frame.args, [rows.as]: row.value },
          };
          const at = sink.trace.length;
          const ran = this.exec(inner, steps.slice(index + 1), sink, { ...results }, within, { ...known });
          for (const entry of sink.trace.slice(at)) entry.item = row.key;
          if (ran.stopped && frame.cost) return { results, rolls: known, stopped: ran.stopped };
          if (ran.stopped?.note) sink.after.push({ text: `${frame.label || frame.owner}: ${ran.stopped.note}` });
        }
        return { results, rolls: known, stopped: null };
      }
      const outer = this.mark;
      const here = { sink, at: sink.trace.length, count: 0 };
      this.mark = here;
      let out;
      try {
        out = runnerOf(step.type).finish(step, ctx);
      } finally {
        this.mark = outer;
      }
      sink.trace.splice(here.at + here.count, 0, { step: name, type: step.type, ...mark, ...out.trace });
      if (step.id != null) results[step.id] = out.value;
      if (step.id != null && out.roll) known[step.id] = out.roll;
      if (out.break) {
        return { results, rolls: known, stopped: { step: name, type: step.type, reason: out.break.reason, ...(out.break.note ? { note: out.break.note } : {}) } };
      }
    }
    return { results, rolls: known, stopped: null };
  }

  private lazyValue(lazy: Lazy, name: string, results: Record<string, unknown>, rolls: Record<string, RollResult>, sink: Sink): void {
    const found = lazy.steps.get(name);
    if (!found || name in results) return;
    const path = lazy.frame.path.step(name);
    let made = this.state.memo(path.key) as { value: unknown; roll?: RollResult } | undefined;
    if (!made) {
      const own = newSink();
      const ctx = this.ctx(lazy.frame, { ...results }, { ...rolls }, path, own, lazy.stepIds);
      if (!ctx.holds(found.step.if)) return;
      const out = runnerOf(found.step.type).finish(found.step, ctx);
      made = { value: out.value, ...(out.roll ? { roll: out.roll } : {}) };
      this.state.remember(path.key, made);
      this.state.write(...own.after);
      const entry = { step: name, type: found.step.type, ...out.trace };
      if (this.mark?.sink === sink) sink.trace.splice(this.mark.at + this.mark.count++, 0, entry);
      else sink.trace.push(entry);
    }
    results[name] = made.value;
    if (made.roll) rolls[name] = made.roll;
  }

  private choiceOf(effectId: string, id: string, key: string): string | undefined {
    const inEffect = (effect: Effect | undefined): string | undefined => {
      if (!effect) return undefined;
      const chains = [effect.steps, effect.cost, effect.attach, effect.detach, ...(effect.on ?? []).flatMap(handler => [handler.steps, handler.cost])];
      const step = chains.flatMap(steps => steps ?? []).find(one => one.id === id && calledBy(one));
      const callee = step ? this.system.effects[calledBy(step)!] : undefined;
      return callee?.returns?.find(one => one.key === key && one.kind === 'choice' && !one.many)?.from;
    };
    return inEffect(this.system.effects[effectId]) ?? Object.values(this.system.effects).map(inEffect).find(Boolean);
  }

  private ctx(frame: Frame, results: Record<string, unknown>, rolls: Record<string, RollResult>, path: Path, sink: Sink, stepIds: ReadonlySet<string>, given?: Die, at?: { steps: readonly Step[]; index: number }): Ctx {
    const die = given ?? this.ext.dice(path);
    const lazy = frame.lazy;
    const ref: RefContext = {
      pass: this.view(frame.home), die, owner: frame.owner, props: frame.props, paramDefs: frame.paramDefs, params: frame.args,
      ...(frame.item ? { item: frame.item, itemRead: (column: string) => this.itemRead(frame.item!, column) } : {}),
      ...(frame.inputs ? { inputs: frame.inputs } : {}),
      results, rolls, stepIds,
      choiceOf: (step: string, key: string) => this.choiceOf(frame.effectId, step, key),
      ...(frame.alone ? { alone: true } : {}),
      ...(frame.bound ? { sheets: { bound: frame.bound, view: (id: string) => this.view(id) } } : {}),
      ...(lazy ? { lazy: (name: string) => this.lazyValue(lazy, name, results, rolls, sink) } : {}),
    };
    const sheetOf = (refValue: unknown, what: string): string | null => {
      const value = resolveRef(refValue, ref);
      if (value === null || value === undefined || value === '') return null;
      if (typeof value !== 'string') throw new EngineError(`${frame.owner || 'правило'}: ${what} — ждали лист, пришло ${JSON.stringify(value)}`);
      if (!this.sheet(value)) throw new EngineError(`${frame.owner || 'правило'}: ${what} — листа «${value}» в комнате нет`);
      return value;
    };
    let rollsMade = 0;
    let asksMade = 0;
    const ctx = {
      system: this.system,
      owner: frame.owner,
      label: frame.label,
      die,
      value: refValue => resolveRef(refValue, ref),
      known: refValue => this.known(refValue, frame, results, rolls, stepIds),
      number: (refValue, what) => {
        try {
          return resolveNumber(refValue, ref, what);
        } catch (err) {
          if (!(err instanceof EngineError) || !refValue || typeof refValue !== 'object') throw err;
          const r = refValue as { expr?: unknown };
          const names = r.expr !== undefined ? compile(String(r.expr)).deps : [];
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
      sheet: sheetOf,
      numberOn: (sheetId, refValue, what) => resolveNumber(refValue, { ...ref, pass: this.view(sheetId), bare: true }, what),
      field: refValue => this.fieldOf(frame, refValue, ref),
      view: sheetId => this.view(sheetId),
      rolled: name => {
        if (lazy && !(name in results)) this.lazyValue(lazy, name, results, rolls, sink);
        return (rolls[name] as unknown as Record<string, unknown> | undefined) ?? null;
      },
      roll: (spec, tags, by, against, bonus, values) => this.roll(frame, spec, tags, by, against, path.phase('roll').nth(rollsMade++), sink,
        bonus ? { label: this.bonusLabel(frame, bonus.ref), value: bonus.value } : undefined, values),
      fieldRoll: (sheetId, check, extra) => this.throwField(frame, ctx as Ctx, path, sink, sheetId, check, extra),
      ahead: () => (at ? this.ahead(frame, at.steps, at.index, rolls) : null),
      faced: (name, other) => this.faced(frame, name, other, rolls),
      read: (sheetId, tag) => this.read(sheetId, tag),
      write: (sheetId, tag, value) => this.write(sheetId, tag, value, sink),
      attach: (sheetId, effectId, args, unbound) => this.attach(frame, sheetId, effectId, args, sink, path, unbound === true),
      detach: (sheetId, effectId, pick) => this.detach(sheetId, effectId, frame.owner, sink, pick && {
        ...(pick.where !== undefined ? { where: (entry: WornEffect) => {
          const blank = Object.fromEntries((this.system.effects?.[effectId]?.params ?? []).map(param => [param.key, null]));
          const value = resolveRef(pick.where, { ...ref, results: { ...results, ...blank, ...(entry.args ?? {}) } });
          if (typeof value !== 'boolean') throw new EngineError(`${frame.owner || 'правило'}: условие «какие снять» должно давать да/нет, а дало ${JSON.stringify(value)}`);
          return value;
        } } : {}),
        ...(pick.one ? { one: true } : {}),
      }),
      edited: (call, param, base, tags, args) => this.edited(call, param, base, tags, args),
      call: (event, args, payload) => this.callEvent(frame, event, payload, args, sink, path),
      question: (sheetId, label, offers) => this.question(sheetId ?? DESK_ID, label, offers, path.ask('step', sheetId ?? DESK_ID).nth(asksMade++), rolls),
      ...(frame.seenRoll ? { seenRoll: frame.seenRoll } : {}),
      ...(frame.cost ? { inCost: true } : {}),
      using: (other: Die) => this.ctx(frame, results, rolls, path, sink, stepIds, other),
      naming: extra => this.ctx(frame, { ...results, ...extra }, rolls, path, sink, new Set([...stepIds, ...Object.keys(extra)]), given, at),
    } as Omit<Ctx, 'here'>;
    return Object.defineProperty(ctx, 'here', { get: () => this.view(frame.home), enumerable: true }) as Ctx;
  }

  private fieldOf(frame: Frame, refValue: unknown, ref: RefContext, seen: ReadonlySet<string> = new Set()): FieldRef {
    const expr = refValue && typeof refValue === 'object' && 'expr' in refValue ? String((refValue as { expr: unknown }).expr) : null;
    const named = expr ? this.addressName(frame, expr, ref) : null;
    const name = named && frame.item ? asItem(named, frame.paramDefs) : named;
    if (name && frame.item && name.startsWith(`${ITEM_NAME}.`)) {
      const sheet = this.sheet(frame.item.sheet);
      if (!sheet) throw new EngineError(`${frame.owner || 'правило'}: листа с вещью «${frame.item.key}» нет`);
      return { sheet: sheet.id, tag: itemColumn(this.system, this.world.compendium, sheet, frame.item.key, name.slice(ITEM_NAME.length + 1)) };
    }
    if (name) {
      const param = frame.paramDefs.find(one => one.key === name && one.kind === 'field');
      const passed = param ? frame.args[param.key] : undefined;
      if (passed && typeof passed === 'object' && 'sheet' in passed && 'tag' in passed) return passed as FieldRef;
      if (passed && typeof passed === 'object' && 'expr' in passed) {
        if (seen.has(name)) throw new EngineError(`${frame.owner || 'правило'}: вход «${param!.label ?? name}» ссылается сам на себя`);
        return this.fieldOf(frame, passed, ref, new Set([...seen, name]));
      }
      if (name.startsWith(`${DESK_ID}.`)) return { sheet: DESK_ID, tag: this.cellOf(frame, DESK_ID, name.slice(DESK_ID.length + 1), ref) };
      const onSheet = sheetHead(name, ref.sheets);
      if (onSheet?.rest) {
        const id = frame.bound?.[onSheet.head];
        if (typeof id !== 'string') throw new EngineError(`${frame.owner || 'правило'}: «${onSheet.head}» не задан — поле «${onSheet.rest}» менять не у кого`);
        return { sheet: id, tag: this.cellOf(frame, id, onSheet.rest, ref) };
      }
    }
    const value = resolveRef(refValue, ref);
    if (value && typeof value === 'object' && 'sheet' in value && 'tag' in value) return value as FieldRef;
    throw new EngineError(`${frame.owner || 'правило'}: ${expr ?? JSON.stringify(refValue)} — не поле листа; выберите в списке лист, затем его поле`);
  }

  private addressName(frame: Frame, expr: string, ref: RefContext): string | null {
    let node: Node;
    try {
      node = compile(expr).ast;
    } catch {
      return null;
    }
    if (node.kind === 'Ref') return node.tag;
    if (node.kind !== 'Pick') return null;
    const key = resolveRef({ expr: printFormula(node.key) }, ref);
    if (key === null || key === undefined || key === '') {
      throw new EngineError(`${frame.owner || 'правило'}: в «${expr}» строка не задана — какую клетку менять?`);
    }
    return `${node.tag}.${String(key)}${node.rest ? `.${node.rest}` : ''}`;
  }

  private cellOf(frame: Frame, sheetId: string, rest: string, ref: RefContext): string {
    if (hasField(this.system, rest)) return rest;
    const split = splitPath(rest);
    const owner = frame.owner || 'правило';
    const own = split && split.path.length > 1 && !frame.paramDefs.some(param => param.key === split.head) ? this.system.tables?.[split.head] : undefined;
    if (split && own) return reach(this.system, this.view(sheetId), split.head, split.path[0], split.path.slice(1), owner);
    const table = split ? referencedTable(this.system, split.head, frame.paramDefs) : undefined;
    if (!split || !table) return rest;
    const key = frame.paramDefs.some(param => param.key === split.head)
      ? resolveRef({ expr: `@${split.head}` }, ref)
      : this.view(sheetId).resolve(split.head);
    if (key === null || key === undefined || key === '') {
      throw new EngineError(`${owner}: «${split.head}» не задан — какую строку «${this.system.tables?.[table]?.label || table}» менять?`);
    }
    return reach(this.system, this.view(sheetId), table, key, split.path, owner);
  }

  private rowsOf(frame: Frame, loop: { table: string; as: string }): { key: string; value: unknown; param: Param }[] {
    const owner = frame.owner || 'правило';
    const table = this.system.tables?.[loop.table];
    if (!table) throw new EngineError(`${owner}: «для каждой строки» — таблицы «${loop.table}» нет`);
    if (!loop.as) throw new EngineError(`${owner}: «для каждой строки «${table.label || loop.table}»» — не сказано, как зовётся строка`);
    const param = { key: loop.as, label: loop.as, kind: 'choice', from: loop.table } as Param;
    return (table.rows ?? []).map(row => ({ key: rowKeyOf(row), value: row.value, param }));
  }

  private known(refValue: unknown, frame: Frame, results: Record<string, unknown>, rolls: Record<string, RollResult>, stepIds: ReadonlySet<string>): boolean {
    if (!refValue || typeof refValue !== 'object' || !('expr' in refValue)) return true;
    for (const name of compile(String((refValue as { expr: unknown }).expr)).deps) {
      const onSheet = frame.bound ? sheetHead(name, { bound: frame.bound, view: id => this.view(id) }) : null;
      if (onSheet) {
        if (frame.bound![onSheet.head] === null) return false;
        continue;
      }
      const split = splitPath(name);
      const head = split?.head ?? name;
      if (frame.lazy?.steps.has(head)) continue;
      if (!stepIds.has(head) || findField(this.system, name)) continue;
      const held = !split ? results[head] : head in results ? results[head] : rolls[head];
      if (held === undefined) return false;
      if (split && split.path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), held) === undefined) return false;
    }
    return true;
  }

  private bonusLabel(frame: Frame, ref: unknown): string | null {
    const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr).trim() : '';
    const lone = /^[@#]([\p{L}\p{N}_]+)$/u.exec(expr);
    const param = lone ? frame.paramDefs.find(one => one.key === lone[1]) : undefined;
    if (param) return param.label || param.key;
    const onSheet = /^[@#][\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)$/u.exec(expr);
    return onSheet ? findField(this.system, onSheet[1]!)?.label ?? null : null;
  }

  private roll(frame: Frame, spec: Spec, tags: string[], by: string | null, against: string | null, path: Path, sink: Sink, shown?: ShownBonus, values: Record<string, unknown> = { [NUMBER_NAME]: null }): Thrown {
    const die = this.ext.dice(path);
    if (!by) {
      const roll = start(spec, [], die, tags);
      return { roll, result: result(roll) };
    }
    const opponent = against && against !== by && this.sheet(against) ? against : null;
    const words = this.system.roll_edits ?? {};
    const claimed = frame.claims[by] ?? [];
    const marks = claimed.filter(claim => !words[claim] && !tags.includes(claim));
    if (marks.length) {
      const known = tagWords(this.system);
      const stray = marks.find(claim => !known.has(claim));
      if (stray) throw new EngineError(`заявка «${stray}» — нет ни правки броска с таким именем, ни метки; правки: ${Object.keys(words).join(', ') || '(словарь пуст)'}`);
      tags = [...tags, ...marks];
    }
    const holders = this.holderViews();
    const added = rollMarks(holders, by, opponent, tags, values);
    if (added.length) tags = [...tags, ...added];
    const spent = (word: string): string => `заявка\u0000${by}\u0000${word}`;
    const claims = claimed.filter(claim => words[claim] && !(words[claim]!.once && this.state.memo(spent(claim))));
    for (const word of claims) if (words[word]!.once && wordApplies(this.system, word, tags)) this.state.remember(spent(word), true);
    const roller = this.view(by);
    const thrown = throwDice({
      spec, tags, claims, held: rollHeld(holders, by, opponent, tags, values), roller, die,
      seen: roll => this.seen(by, opponent, roll, tags, path, frame.hop, sink, shown),
    });
    return { ...thrown, thrower: { path, by, against: opponent, spec, tags, claims, roller, holders, roll: thrown.roll, values } };
  }

  private loneSheet(frame: Frame, ref: unknown): string | null {
    const text = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : null;
    const name = text ? /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(text)?.[1] : undefined;
    const id = name && frame.bound ? frame.bound[name] : null;
    return typeof id === 'string' ? id : null;
  }

  private namesAt(frame: Frame, steps: readonly Step[], rolls: Record<string, RollResult>): Names {
    return {
      sheet: name => {
        if (!frame.bound || !Object.hasOwn(frame.bound, name)) return undefined;
        const id = frame.bound[name];
        return typeof id === 'string' ? id : null;
      },
      roller: name => {
        const record = recordOf(rolls[name]);
        if (record) return record.by;
        const step = steps.find(one => one.id === name) as StepData | undefined;
        const by = step ? runnerOf(step.type).thrownBy?.(step) : undefined;
        if (by === undefined || by === null) return undefined;
        return this.loneSheet(frame, by);
      },
    };
  }

  private ahead(frame: Frame, steps: readonly Step[], index: number, rolls: Record<string, RollResult>): string | null {
    const own = steps[index] as StepData | undefined;
    const id = typeof own?.id === 'string' ? own.id : null;
    const roller = own ? this.loneSheet(frame, runnerOf(own.type).thrownBy?.(own)) : null;
    if (!id || !roller) return null;
    const names = this.namesAt(frame, steps, rolls);
    const found = new Set<string>();
    let depth = 0;
    let other = false;
    for (const raw of steps.slice(index + 1)) {
      const next = raw as StepData;
      const runner = runnerOf(next.type);
      if (runner.loops || runner.rows?.(next) || runner.splits?.(next)) break;
      if (runner.flow === 'open') { depth += 1; continue; }
      if (runner.flow === 'alt') { if (depth === 0) other = true; continue; }
      if (runner.flow === 'close') { if (depth > 0) depth -= 1; else other = false; continue; }
      if (depth > 0 || other || (next.if !== undefined && next.if !== null)) continue;
      const sides = runner.compares?.(next);
      if (!sides) continue;
      const far = mentions(sides.value, id) ? sides.versus : mentions(sides.versus, id) ? sides.value : undefined;
      if (far === undefined) continue;
      const met = opponentIn(far, roller, names);
      if (!met.known) return null;
      if (met.id) found.add(met.id);
    }
    return found.size === 1 ? [...found][0]! : null;
  }

  private faced(frame: Frame, name: string, other: unknown, rolls: Record<string, RollResult>): Faced | null {
    const record = recordOf(rolls[name]);
    if (!record) return null;
    const met = opponentIn(other, record.by, this.namesAt(frame, [], rolls));
    const opponent = met.known ? met.id : null;
    if (!opponent || opponent === record.against || !record.holders.some(holder => holder.id === opponent)) return null;
    const dice = (key: string): Die => this.ext.dice(record.path.phase(NAMES.against).item(key));
    return retarget(record, opponent, this.sheet(opponent)?.name ?? opponent, dice, this.system);
  }

  private edited(call: string, param: string, base: number, tags: string[], args: Record<string, unknown>): number {
    const callee = this.system.effects[call];
    const names = namesOf(callee?.params, args);
    const rolls = rollsOf(callee?.params, args);
    const values = { ...valuesOf(callee?.params, args), ...totalsOf(rolls) };
    const held = gather(this.holderViews(), { call, param, tags, names, values, rolls, view: id => this.view(id) });
    return stack(held, base, `${call}.${param}`, paramStages(callee?.params, param));
  }

  private holder(sheetId: string, tag: string): string {
    if (parseItemTag(tag)) return sheetId;
    const holder = this.views.holderOf(this.state.sheets, sheetId, tag);
    if (this.sheet(holder)) return holder;
    if (findField(this.system, tag)?.lives === 'group') return sheetId;
    throw new EngineError(`поле «${tag}» лежит на «${holder}», а такого листа здесь нет`);
  }

  durationOf(effect: Effect, sheetId: string, args: Record<string, unknown>, path: Path, owner: string): number | undefined {
    const raw = effect.duration?.max;
    if (!raw || typeof raw !== 'object') return undefined;
    const value = resolveRef(raw, {
      pass: this.view(sheetId), die: this.ext.dice(path.phase('duration')), owner: `${owner}: срок «${effect.label ?? ''}»`,
      params: args, paramDefs: effect.params ?? [],
    });
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new EngineError(`${owner}: срок «${effect.label ?? ''}» — формула дала не число`);
    return value;
  }

  private itemRead(item: ItemRef, column: string): unknown {
    const sheet = this.sheet(item.sheet);
    if (!sheet || !(sheet.has ?? []).some(entry => (entry.id ?? entry.of) === item.key)) return null;
    return this.read(item.sheet, itemTag(item.key, column));
  }

  private read(sheetId: string, tag: string): unknown {
    const item = parseItemTag(tag);
    if (item) {
      const owner = `вещь «${item.key}»`;
      return itemStored(this.system, this.world.compendium, this.sheet(sheetId)!, item.key, item.column,
        expr => resolveRef({ expr }, { pass: this.view(sheetId), owner })) ?? null;
    }
    const sheet = this.sheet(this.holder(sheetId, tag))!;
    if (Object.prototype.hasOwnProperty.call(sheet.values, tag)) return sheet.values[tag];
    const field = findField(this.system, tag);
    if (!field) throw new EngineError(`система не объявляет поля «${tag}» — читать нечего`);
    return baseOf(this.view(sheet.id), field);
  }

  private write(sheetId: string, tag: string, value: StoredValue, sink: Sink): void {
    const from = this.read(sheetId, tag);
    if (sameValue(from, value)) return;
    const holder = this.sheet(this.holder(sheetId, tag))!;
    sink.changes.push({ tag, from, to: value, sheetId: holder.id });
    const item = parseItemTag(tag);
    this.state.put(item ? withItemValue(holder, item.key, item.column, value) : { ...holder, values: { ...holder.values, [tag]: value } });
  }

  hold(inst: string, args: Record<string, StoredValue>): void {
    this.holding.set(inst, args);
  }

  private placeHolder(bond: NonNullable<WornEffect['bond']>): void {
    const inst = bond.inst;
    if (!inst || !this.holding.has(inst)) return;
    const holder = this.sheet(bond.sheet);
    if (!holder || (holder.effects ?? []).some(entry => entry.inst === inst)) return;
    const args = this.holding.get(inst)!;
    this.state.put({ ...holder, effects: [...(holder.effects ?? []), { effectId: bond.effect, inst, ...(Object.keys(args).length ? { args } : {}) }] });
  }

  private attach(frame: Frame, sheetId: string, effectId: string, args: Record<string, StoredValue>, sink: Sink, path: Path, unbound = false): void {
    const bond = unbound ? undefined : frame.bond;
    const effect = requireEffect(this.system, effectId, frame.owner);
    const sheet = this.sheet(sheetId)!;
    const worn: WornEffect[] = [...(sheet.effects ?? [])];
    const declared = new Set((effect.params ?? []).map(param => param.key));
    const kept = Object.fromEntries(Object.entries(args).filter(([key, value]) => declared.has(key) && value !== null && value !== undefined));
    const sorted = (args: Record<string, unknown>): string => JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)));
    const sameArgs = (entry: WornEffect): boolean => sorted(entry.args ?? {}) === sorted(kept);
    const at = worn.findIndex(entry => entry.effectId === effectId && (reapplyOf(effect) !== 'refresh' || sameArgs(entry)));
    const counted = this.durationOf(effect, sheetId, kept, path, frame.owner);
    const fresh: WornEffect = {
      effectId,
      ...(Object.keys(kept).length ? { args: kept } : {}),
      ...expiryOf(effect, this.clock, counted),
      ...(bond ? { bond } : {}),
      ...(reapplyOf(effect) === 'stack' ? { inst: this.ext.id(path.phase('inst').phase(effectId)) } : {}),
    };
    const max = usesMax(effect, counted);
    if (max !== null) fresh.usesLeft = max;
    if (at < 0) worn.push(fresh);
    else if (reapplyOf(effect) === 'refresh') {
      const inst = this.insts.get(worn[at]!);
      if (inst) this.insts.set(fresh, inst);
      worn[at] = fresh;
    } else if (reapplyOf(effect) === 'stack') worn.push(fresh);
    else return;
    this.state.put({ ...sheet, effects: worn });
    if (bond) this.placeHolder(bond);
    if (!sink.effects.includes(effectId)) sink.effects.push(effectId);
  }

  private detach(sheetId: string, effectId: string, owner: string, sink: Sink, pick?: { where?: (entry: WornEffect) => boolean; one?: boolean }): void {
    requireEffect(this.system, effectId, owner);
    const sheet = this.sheet(sheetId)!;
    const own = this.running.at(-1);
    const self = own && own.sheetId === sheetId && own.effectId === effectId ? own : null;
    let nth = 0;
    let taken = 0;
    const worn = (sheet.effects ?? []).filter(entry => {
      if (entry.effectId !== effectId) return true;
      if (self) return this.instOf(entry, false, nth++) !== self.inst;
      if (pick?.where && !pick.where(entry)) return true;
      if (pick?.one && taken > 0) return true;
      taken += 1;
      return false;
    });
    if (worn.length === (sheet.effects ?? []).length) return;
    this.state.put({ ...sheet, effects: worn });
    sink.removed.push(effectId);
  }

  private callEvent(frame: Frame, event: string, payload: EmittedEvent, args: Record<string, unknown>, sink: Sink, path: Path): NestedRun {
    const callee = requireCalled(this.system, event, frame.owner);
    if (this.chain.length >= this.limits.callDepth) {
      throw new EngineError(`${frame.owner || 'правило'}: вызовы вложены глубже ${this.limits.callDepth} — похоже, идут по кругу: ${[...this.chain, event].join(' → ')}`);
    }
    const names = namesOf(callee.params, args);
    const passed = rollsOf(callee.params, args);
    const values = { ...valuesOf(callee.params, args), ...totalsOf(passed), метки: payload.tags };
    const home = Object.values(names).find((id): id is string => typeof id === 'string') ?? frame.home;
    const at = path.call(event);
    const keys = keysOf(this.system, event, false);
    const emitted: EmittedEvent = { ...payload, names, values };
    sink.emitted.push(emitted);
    if (frame.inSub) {
      const { entries, delivered } = this.group([{
        effectId: event, label: callee.label || event, steps: callee.steps ?? [], path: at, hop: frame.hop + 1, top: false,
        home: frame.home, subject: home, bound: names, keys, args: values, paramDefs: callee.params ?? [], seed: { метки: payload.tags }, rolls: passed,
        ...(frame.cost ? { cost: true } : {}),
      }], at);
      sink.after.push(...entries);
      const out = delivered[0];
      return { results: out?.results ?? {}, stopped: out?.report.stopped ?? null, ...(out?.returns ? { returns: out.returns } : {}) };
    }
    if (this.handlers.length) this.spend();
    this.chain.push(event);
    try {
      const inner: Frame = {
        path: at, effectId: event, label: callee.label || event, owner: `вызов «${callee.label || event}»`,
        home, bound: names, args: values, paramDefs: callee.params ?? [], props: null, claims: frame.claims, hop: frame.hop, inSub: false,
        ...(frame.inputs ? { inputs: frame.inputs } : {}),
        ...(frame.cost ? { cost: true } : {}),
      };
      const before = keys.map(key => `before:${key}`);
      const peek = this.listens(before) ? this.probe(() => this.exec(inner, callee.steps ?? [], newSink(), { метки: payload.tags }, event, passed)) : null;
      this.hear({ keys: before, names, seed: { ...values, ...(peek?.results ?? {}) }, rolls: peek?.rolls ?? {}, path: at.phase('before'), hop: frame.hop, owner: sub => `«${labelOf(sub)}» — до «${callee.label || event}»` }, sink);
      const ran = this.exec(inner, callee.steps ?? [], sink, { метки: payload.tags }, event, passed);
      const returns = this.returnsOf(callee, inner, ran);
      if (returns) emitted.values = { ...values, ...returns };
      this.hear({ keys: keys.map(key => `after:${key}`), names, seed: { ...values, ...ran.results, ...(returns ?? {}) }, rolls: ran.rolls, path: at.phase('after'), hop: frame.hop, owner: sub => `«${labelOf(sub)}» — после «${callee.label || event}»` }, sink);
      return { results: ran.results, stopped: ran.stopped, ...(returns ? { returns } : {}) };
    } finally {
      this.chain.pop();
    }
  }

  group(calls: Delivery[], path: Path, delivered?: (out: Delivered, entries: Entry[]) => void, write?: (entries: Entry[]) => void): { entries: Entry[]; delivered: Delivered[] } {
    const collected: Entry[] = [];
    const flush = (entries: Entry[]): void => {
      if (!entries.length) return;
      if (write) write(entries.splice(0));
      else collected.push(...entries.splice(0));
    };
    const entries: Entry[] = [];
    const done: Delivered[] = [];
    for (const call of calls) {
      try {
        if (call.hop > 0) this.spend();
        let tried = this.probeAsking(() => this.body(call, newSink()));
        let accepted = 0;
        for (const holder of this.holders()) {
          if (accepted >= this.limits.probes) {
            entries.push({ text: PROBES_WORDS });
            break;
          }
          const qpath = call.path.ask('target', holder.id);
          const offers = this.offers(holder.id, call.keys.map(key => `before:${key}`), call.bound, { ...(call.seed ?? {}), ...tried.results }, [], qpath, tried.rolls);
          if (!offers.length) continue;
          const asked = this.ask({
            key: qpath.key, sheetId: holder.id, window: 'target', label: call.top ? '' : call.label,
            offers: offers.map(found => found.offer), results: tried.results,
            preview: call.top ? previewLines(this.system, call.effectId, [...(call.lead ?? []), ...tried.report.trace]) : [],
          }, offers, call.hop, qpath);
          entries.push(...asked.entries);
          flush(entries);
          if (asked.accepted) {
            accepted++;
            tried = this.probeAsking(() => this.body(call, newSink()));
          }
        }
        const sink = newSink();
        const out = this.body(call, sink, tried);
        entries.push({ fromId: call.home, toId: call.subject ?? call.home, report: out.report }, ...sink.after);
        delivered?.(out, entries);
        done.push(out);
      } catch (err) {
        if (!(err instanceof Limit) || this.handlers.length) throw err;
        entries.push({ text: CUT_WORDS });
      }
      flush(entries);
    }
    for (const holder of this.holders()) {
      const offers: OfferFound[] = [];
      const qpath = path.ask('after', holder.id);
      for (const out of done) {
        const tag = done.length > 1 && out.call.subject ? out.call.subject : null;
        const found = this.offers(holder.id, out.call.keys.map(key => `after:${key}`), out.call.bound, { ...(out.call.seed ?? {}), ...out.results, ...(out.returns ?? {}) }, out.emitted, qpath, out.rolls);
        for (const one of found) {
          const id = tag ? `${one.offer.id}|${tag}` : one.offer.id;
          const label = tag ? `${one.offer.label} — ${this.sheet(tag)?.name ?? tag}` : one.offer.label;
          const known = offers.find(other => other.offer.id === id);
          if (known) known.picks.push(...one.picks);
          else offers.push({ offer: { id, label }, picks: one.picks });
        }
      }
      if (!offers.length) continue;
      const only = done.length === 1 ? done[0]! : null;
      entries.push(...this.ask({
        key: qpath.key, sheetId: holder.id, window: 'after', label: only && !only.call.top ? only.call.label : '',
        offers: offers.map(found => found.offer), results: only?.results ?? {}, preview: [],
      }, offers, done[0]!.call.hop, qpath).entries);
      flush(entries);
    }
    return { entries: collected, delivered: done };
  }

  argValues(frame: Frame): Record<string, unknown> {
    const ctx = this.ctx(frame, {}, {}, frame.path.phase('args'), newSink(), new Set());
    const out: Record<string, unknown> = {};
    const tags: string[] = [...(this.system.effects[frame.effectId]?.tags ?? [])];
    for (const param of frame.paramDefs) {
      if (param.kind === 'sheet' || param.kind === 'field') continue;
      let value: unknown;
      try {
        value = ctx.value({ expr: `@${param.key}` });
      } catch (err) {
        if (!isRuleError(err)) throw err;
        continue;
      }
      if (value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value))) continue;
      out[param.key] = value;
      if (param.kind === 'choice' && param.from) tags.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
    }
    out.метки = tags;
    return out;
  }

  body(call: Delivery, sink: Sink, tried?: { results: Record<string, unknown>; rolls: Record<string, RollResult> }): Delivered {
    const frame: Frame = {
      path: call.path, effectId: call.effectId, label: call.label, owner: `эффект «${call.label}»`,
      home: call.home, bound: call.bound,
      args: call.args ?? {}, paramDefs: call.paramDefs ?? [], props: call.props ?? null,
      ...(call.item ? { item: call.item } : {}),
      ...(call.inputs ? { inputs: call.inputs } : {}),
      claims: call.claims ?? {}, hop: call.hop, inSub: false,
      ...(call.bond ? { bond: call.bond } : {}),
      ...(call.lazy ? { lazy: call.lazy } : {}),
      ...(call.offset ? { offset: call.offset } : {}),
      ...(call.cost ? { cost: true } : {}),
    };
    const given = call.top
      ? this.argValues(frame)
      : Object.fromEntries(Object.entries(call.args ?? {}).filter(([, value]) => value === null || typeof value !== 'object'));
    const seed = { ...given, ...(call.seed ?? {}) };
    this.hear({ keys: call.keys.map(key => `before:${key}`), names: call.bound, seed: { ...seed, ...(tried?.results ?? {}) }, rolls: { ...(call.rolls ?? {}), ...(tried?.rolls ?? {}) }, path: call.path.phase('before'), hop: call.hop, owner: sub => `«${labelOf(sub)}» — до «${call.label}»` }, sink);
    const ran = this.exec(frame, call.steps, sink, seed, undefined, call.rolls ?? {});
    const callee = this.system.effects?.[call.effectId];
    const returns = callee ? this.returnsOf(callee, frame, ran) : null;
    this.hear({ keys: call.keys.map(key => `after:${key}`), names: call.bound, seed: { ...given, ...ran.results, ...(returns ?? {}) }, rolls: ran.rolls, path: call.path.phase('after'), hop: call.hop, owner: sub => `«${labelOf(sub)}» — после «${call.label}»` }, sink);
    const report = reportOf('effect', call.effectId, call.home, call.label, sink, ran.stopped, call.hop > 0);
    return { call, results: ran.results, rolls: ran.rolls, emitted: sink.emitted, report, ...(returns ? { returns } : {}) };
  }

  holdsAt(frame: Frame, guard: unknown): boolean {
    return this.ctx(frame, {}, {}, frame.path.phase('bond'), newSink(), new Set()).holds(guard);
  }

  valuesAt(frame: Frame, refs: Record<string, unknown>): Record<string, StoredValue> {
    const ctx = this.ctx(frame, {}, {}, frame.path.phase('bond'), newSink(), new Set());
    const out: Record<string, StoredValue> = {};
    for (const [key, ref] of Object.entries(refs)) {
      const value = ctx.value(ref);
      if (value === null || value === undefined || value === '') continue;
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new EngineError(`${frame.owner || 'правило'}: держатель запоминает число, строку или лист, а «${key}» дал ${JSON.stringify(value)}`);
      }
      out[key] = value;
    }
    return out;
  }

  private returnsOf(callee: Effect, frame: Frame, ran: Ran): Record<string, unknown> | null {
    const columns = callee.returns ?? [];
    if (!columns.length) return null;
    const out: Record<string, unknown> = Object.fromEntries(columns.map(column => [column.key, null]));
    if (ran.stopped) return out;
    const ids = stepIdsOf([...(callee.steps ?? []), ...(callee.cost ?? [])]);
    const results = { ...Object.fromEntries(ids.map(id => [id, null])), ...ran.results };
    const ctx = this.ctx(frame, results, ran.rolls, frame.path.phase('returns'), newSink(), new Set(ids));
    for (const column of columns) {
      const value = column.expr ? ctx.value(column.expr) : null;
      out[column.key] = value === undefined ? null : value;
    }
    return out;
  }

  private listens(keys: readonly string[]): boolean {
    const wanted = new Set(keys);
    return this.holders().some(holder => this.subs(holder).some(sub => wanted.has(sub.handler.on) && !sub.handler.confirm));
  }

  hear(hearing: Hearing, sink: Sink): void {
    const wanted = new Set(hearing.keys);
    for (const holder of this.holders()) {
      const live = this.sheet(holder.id);
      if (!live) continue;
      for (const sub of this.subs(live)) {
        if (!wanted.has(sub.handler.on) || sub.handler.confirm) continue;
        const out = this.react(sub, {
          path: hearing.path.handler(holder.id, sub.key, sub.inst), names: hearing.names, seed: hearing.seed, rolls: hearing.rolls ?? {}, hop: hearing.hop, chosen: false,
          owner: hearing.owner(sub), ...(hearing.roll ? { roll: hearing.roll } : {}), ...(hearing.kind ? { kind: hearing.kind } : {}),
        });
        if (out.report) sink.reactions.push(out.report);
        if (out.spent) sink.spent.push(out.spent);
        sink.after.push(...out.lead, ...out.entries);
      }
    }
  }

  private live(sub: Sub): Sub | null {
    const sheet = this.sheet(sub.sheetId);
    return sheet ? this.subs(sheet).find(other => same(other, sub)) ?? null : null;
  }

  private hanging(sub: Sub): { bound: Record<string, Bound>; inputs: Record<string, number | string> } {
    const args = (sub.entry.args ?? {}) as Record<string, StoredValue>;
    const sheets = sheetParams(sub.effect.params);
    const bound: Record<string, Bound> = {};
    const inputs: Record<string, number | string> = {};
    for (const param of sub.effect.params ?? []) {
      const value = args[param.key];
      if (sheets.has(param.key)) bound[param.key] = typeof value === 'string' ? value : null;
      else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') inputs[param.key] = value as never;
    }
    const left = leftOf(sub.entry, this.clock);
    if (left !== null) inputs[LEFT_NAME] = left;
    return { bound, inputs };
  }

  private boundFor(sub: Sub, names: Record<string, Bound>): Record<string, Bound> {
    return { ...this.hanging(sub).bound, ...names, носитель: sub.sheetId };
  }

  private holds(sub: Sub, names: Record<string, Bound>, seed: Record<string, unknown>, rolls: Record<string, RollResult> = {}): boolean {
    try {
      const hanging = this.hanging(sub);
      return holdsNow(sub.handler.if, {
        pass: this.view(sub.sheetId), results: seed, rolls, owner: `подписка «${labelOf(sub)}»`,
        choiceOf: (step: string, key: string) => this.choiceOf(sub.effectId, step, key),
        ...(Object.keys(hanging.inputs).length ? { inputs: hanging.inputs } : {}),
        paramDefs: sub.effect.params ?? [],
        sheets: { bound: this.boundFor(sub, names), view: id => this.view(id) },
      });
    } catch (err) {
      if (!isRuleError(err)) throw err;
      return false;
    }
  }

  private subFrame(sub: Sub, path: Path, hop: number, owner: string, names: Record<string, Bound>, roll?: { value: Roll; bonus?: number }): Frame {
    const hanging = this.hanging(sub);
    return {
      path, effectId: sub.effectId, label: labelOf(sub), owner, home: sub.sheetId,
      bound: this.boundFor(sub, names), args: {}, paramDefs: sub.effect.params ?? [], props: null,
      ...(Object.keys(hanging.inputs).length ? { inputs: hanging.inputs } : {}),
      claims: {}, hop, inSub: true, ...(roll ? { seenRoll: roll } : {}),
    };
  }

  private pay(sub: Sub, path: Path, names: Record<string, Bound>, seed: Record<string, unknown>, hop: number, rolls: Record<string, RollResult> = {}): { why: string | null; report: Report; after: Entry[]; changed: boolean } {
    const own = newSink();
    const ran = this.exec({ ...this.subFrame(sub, path, hop, `плата за «${labelOf(sub)}»`, names), cost: true }, sub.handler.cost ?? [], own, seed, undefined, rolls);
    const report = reportOf('effect', sub.effectId, sub.sheetId, labelOf(sub), own, ran.stopped, false);
    return { why: refusalWords(report, this.system), report, after: own.after, changed: own.changes.length > 0 || own.effects.length > 0 || own.removed.length > 0 || own.after.length > 0 };
  }

  refusal(sub: Sub, path: Path, names: Record<string, Bound>, seed: Record<string, unknown>, hop: number, rolls: Record<string, RollResult> = {}): string | null {
    if (!sub.handler.cost?.length) return null;
    return this.probe(() => this.pay(sub, path, names, seed, hop, rolls).why);
  }

  react(found: Sub, o: {
    path: Path; names: Record<string, Bound>; seed: Record<string, unknown> | (() => Record<string, unknown>); hop: number;
    rolls?: Record<string, RollResult>;
    chosen: boolean; owner: string; roll?: { value: Roll; bonus?: number }; builtin?: boolean; kind?: Report['kind']; label?: string;
  }): { lead: Entry[]; report?: Report; entries: Entry[]; spent?: string } {
    const entries: Entry[] = [];
    const lead: Entry[] = [];
    const label = o.label ?? labelOf(found);
    const sub = o.builtin ? found : this.live(found);
    if (!sub) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: эффекта уже нет` });
      return { lead, entries };
    }
    const seed = typeof o.seed === 'function' ? o.seed() : o.seed;
    const rolls = o.rolls ?? {};
    if (!o.builtin && !this.holds(sub, o.names, seed, rolls)) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: условие уже не выполняется` });
      return { lead, entries };
    }
    const mark = sub.key;
    if (this.handlers.filter(one => one === mark).length >= this.limits.handlerDepth) {
      return { lead, entries: [{ text: CUT_WORDS }] };
    }
    const why = o.builtin ? null : this.refusal(sub, o.path.pay(), o.names, seed, o.hop, rolls);
    if (why) {
      if (o.chosen) entries.push({ text: `«${label}» не состоялось: ${why}` });
      return { lead, entries };
    }
    this.state.begin();
    if (!this.handlers.length) this.state.budget = this.limits.budget;
    this.handlers.push(mark);
    this.running.push(sub);
    try {
      if (!o.builtin && sub.handler.cost?.length) {
        const paid = this.pay(sub, o.path.pay(), o.names, seed, o.hop, rolls);
        if (paid.why) {
          this.state.rollback();
          return { lead, entries: [{ text: `«${label}» не состоялось: ${paid.why}` }] };
        }
        if (paid.changed) lead.push({ fromId: sub.sheetId, toId: sub.sheetId, report: paid.report }, ...paid.after);
      }
      const own = newSink();
      const ran = this.exec(this.subFrame(sub, o.path, o.hop, o.owner, o.names, o.roll), sub.handler.steps ?? [], own, seed, undefined, rolls);
      const report = reportOf(o.kind ?? 'effect', sub.effectId, sub.sheetId, label, own, ran.stopped, false);
      entries.push(...own.after);
      const spent = !o.builtin && burnsUse(sub.effect);
      if (spent) entries.push(...this.burn(sub));
      this.state.commit();
      return { lead, report, entries, ...(spent ? { spent: sub.effectId } : {}) };
    } catch (err) {
      if (err instanceof Pause) {
        this.state.commit();
        throw err;
      }
      this.state.rollback();
      if (!(err instanceof Limit)) throw err;
      return { lead: [], entries: [{ text: CUT_WORDS }] };
    } finally {
      this.handlers.pop();
      this.running.pop();
    }
  }

  private burn(sub: Sub): Entry[] {
    const sheet = this.sheet(sub.sheetId);
    if (!sheet) return [];
    const counts = new Map<string, number>();
    const effects: WornEffect[] = [];
    let spent: WornEffect['bond'];
    for (const entry of sheet.effects ?? []) {
      const nth = counts.get(entry.effectId) ?? 0;
      counts.set(entry.effectId, nth + 1);
      if (entry.effectId !== sub.effectId || this.instOf(entry, false, nth) !== sub.inst) { effects.push(entry); continue; }
      const left = Number(entry.usesLeft ?? 1) - 1;
      if (left <= 0) { spent = entry.bond; continue; }
      const next = { ...entry, usesLeft: left };
      this.insts.set(next, sub.inst);
      effects.push(next);
    }
    this.state.put({ ...sheet, effects });
    return spent ? this.letGo(spent) : [];
  }

  private letGo(bond: NonNullable<WornEffect['bond']>): Entry[] {
    const holder = this.sheet(bond.sheet);
    const mine = (entry: WornEffect): boolean => entry.effectId === bond.effect && (!bond.inst || entry.inst === bond.inst);
    if (!holder || !(holder.effects ?? []).some(mine)) return [];
    const held = this.state.sheets.some(sheet => (sheet.effects ?? []).some(entry => entry.bond?.sheet === bond.sheet && entry.bond.effect === bond.effect && entry.bond.inst === bond.inst));
    if (held) return [];
    this.state.put({ ...holder, effects: (holder.effects ?? []).filter(entry => !mine(entry)) });
    return [{ text: `«${effectLabelOf(this.system, bond.effect)}» спало с ${holder.name}: держать больше нечего` }];
  }

  moment(moment: MomentKey, subjects: readonly string[], path: Path): { sheetId: string; effectId: string }[] {
    const expired: { sheetId: string; effectId: string }[] = [];
    for (const sheetId of subjects) {
      const lapsed = lapse({ moment, sheetId }, [...this.state.sheets], this.system, this.clock);
      this.state.replace(lapsed.sheets);
      for (const gone of lapsed.expired) {
        this.state.write({ text: `«${effectLabelOf(this.system, gone.effectId)}» спало с ${this.sheet(gone.sheetId)?.name ?? gone.sheetId}` });
      }
      expired.push(...lapsed.expired);
    }
    const turn = moment === 'turn-start' || moment === 'turn-end';
    const own = turn || moment === 'combat-leave';
    const round = this.clock?.round ?? 0;
    const who = own ? subjects : [null];
    for (const subject of who) {
      const names: Record<string, Bound> = subject ? { [turn ? NAMES.mover : NAMES.sheet]: subject } : {};
      const at = subject ? path.phase(moment).at(subject) : path.phase(moment);
      this.hooked(`moment:${moment}`, names, at, { moment: { moment, round, ...(subject ? { sheet: subject } : {}) } }, MOMENTS[moment],
        sub => `момент «${MOMENTS[moment]}» у «${labelOf(sub)}»`);
    }
    return expired;
  }

  private hooked(key: string, names: Record<string, Bound>, path: Path, seed: Record<string, unknown>, about: string, owner: (sub: Sub) => string): void {
    for (const holder of this.holders()) {
      const sheet = this.sheet(holder.id);
      if (!sheet) continue;
      const all = this.subs(sheet).filter(sub => sub.handler.on === key);
      for (const sub of all.filter(one => !one.handler.confirm)) {
        this.momentReact(sub, path.handler(holder.id, sub.key, sub.inst), names, seed, owner(sub), labelOf(sub));
      }
      const qpath = path.ask('moment', holder.id);
      const byKey = new Map<string, { offer: Offer; subs: Sub[] }>();
      for (const sub of all.filter(one => one.handler.confirm)) {
        const live = this.live(sub);
        if (!live) continue;
        if (!this.holds(live, names, seed) || this.refusal(live, qpath.pick(live.key).pay(), names, seed, 0)) continue;
        const known = byKey.get(live.key);
        if (known) known.subs.push(live);
        else byKey.set(live.key, { offer: { id: live.key, label: labelOf(live) }, subs: [live] });
      }
      if (!byKey.size) continue;
      const { chosen, skipped } = this.choose({
        key: qpath.key, sheetId: holder.id, window: 'moment', label: about, offers: [...byKey.values()].map(one => one.offer), results: seed, preview: [],
      });
      for (const id of chosen) {
        const found = byKey.get(id)!;
        const pick = found.subs.find(sub => this.live(sub) && !this.refusal(sub, qpath.pick(id).pay(), names, seed, 0)) ?? found.subs[0]!;
        this.momentReact(pick, qpath.pick(id), names, seed, owner(pick), labelOf(pick), false, true);
      }
      if (skipped) this.state.write({ text: `${this.sheet(holder.id)?.name ?? holder.id} пропускает реакцию` });
    }
  }

  private momentReact(sub: Sub, path: Path, names: Record<string, Bound>, seed: Record<string, unknown>, owner: string, label: string, builtin = false, chosen = false): void {
    const out = this.react(sub, { path, names, seed, hop: 0, chosen, owner, kind: 'moment', label, builtin });
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
      const loose = freeHolders(before, [...this.state.sheets]);
      this.state.replace(loose.sheets);
      for (const one of loose.freed) {
        this.state.write({ text: `«${effectLabelOf(this.system, one.effectId)}» спало с ${this.sheet(one.sheetId)?.name ?? one.sheetId}: держать больше нечего` });
      }
      if (!crossed && !swept.broken.length && !loose.freed.length) return;
    }
    throw new EngineError(`наложения, поля и связи будят друг друга без остановки: больше ${this.limits.settleRounds} кругов`);
  }

  lifecycle(from: Sheet[], path: Path): void {
    let previous = from;
    for (let wave = 0; ; wave += 1) {
      if (wave > this.limits.settleRounds * 4) throw new EngineError('наложения и спадания будят друг друга без остановки');
      const changes = lifecycleChanges(previous, [...this.state.sheets], { system: this.system, compendium: this.world.compendium });
      previous = [...this.state.sheets];
      if (!changes.length) return;
      for (const change of changes) {
        const effect = this.system.effects[change.entry.effectId];
        if (!effect) continue;
        const live = this.sheet(change.sheetId);
        if (!live) continue;
        const name = effect.label ?? change.entry.effectId;
        const own = effect[change.turn];
        const inst = this.instIn(change.turn === 'attach' ? this.state.sheets : previous, change.sheetId, change.entry);
        const at = path.nth(wave).phase(change.turn).at(change.sheetId).phase(change.entry.effectId).phase(inst);
        if (own?.length) {
          const hook: Sub = {
            sheetId: change.sheetId, effectId: change.entry.effectId, effect, entry: change.entry, inst,
            handler: { on: change.turn, steps: own } as Sub['handler'], key: `${change.entry.effectId}:${change.turn}`,
          };
          this.momentReact(hook, at.phase('hook'), {}, {}, `«${name}» ${HOOK_WORDS[change.turn]}`, `${name} · ${HOOK_WORDS[change.turn]}`, true);
        }
        const turn = change.turn === 'attach' ? 'gained' : 'lost';
        const seed = { about: { ...(change.entry.args ?? {}) }, эффект: change.entry.effectId };
        for (const heard of [change.entry.effectId, ...(effect.tags ?? []).filter(tag => tag !== change.entry.effectId)]) {
          const where = heard === change.entry.effectId ? at : at.phase('tag').phase(heard);
          this.hooked(`${turn}:${heard}`, { лист: change.sheetId }, where, seed, `«${name}» ${HEARD_WORDS[change.turn]}`,
            sub => `«${name}» ${HEARD_WORDS[change.turn]} у «${labelOf(sub)}»`);
        }
      }
    }
  }

  private fieldTags(): Set<string> {
    const tags = new Set<string>();
    for (const holder of this.holders()) {
      for (const sub of this.subs(holder)) {
        if (sub.handler.on.startsWith('field:')) tags.add(sub.handler.on.slice('field:'.length));
      }
    }
    return tags;
  }

  crossings(from: Sheet[], path: Path): boolean {
    let previous = from;
    let any = false;
    for (let wave = 0; ; wave += 1) {
      if (wave > this.limits.settleRounds * 4) throw new EngineError('поля будят эффекты без остановки');
      const now = [...this.state.sheets];
      const tags = this.fieldTags();
      const found: { sheetId: string; tag: string; value: unknown }[] = [];
      for (const sheet of now) {
        const was = previous.find(s => s.id === sheet.id);
        if (!was || was === sheet) continue;
        for (const tag of tags) {
          const after = this.valueIn(now, sheet.id, tag);
          if (!truthy(after) || truthy(this.valueIn(previous, sheet.id, tag))) continue;
          found.push({ sheetId: sheet.id, tag, value: after });
        }
      }
      previous = now;
      if (!found.length) return any;
      any = true;
      for (const { sheetId, tag, value } of found) {
        const label = findField(this.system, tag)?.label ?? tag;
        this.hooked(`field:${tag}`, { лист: sheetId }, path.nth(wave).phase(tag).at(sheetId), { field: { tag, value } }, `поле «${label}» стало верным`,
          sub => `поле «${label}» стало верным у «${labelOf(sub)}»`);
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

  check(sheetId: string, check: Check, path: Path, owner: string, claims: readonly string[] = [], versus: number | null = null): FieldThrow & { entries: Entry[] } {
    const frame: Frame = {
      path, effectId: '', label: owner, owner, home: sheetId, bound: null,
      args: {}, paramDefs: [], props: null, claims: claims.length ? { [sheetId]: [...claims] } : {}, hop: 0, inSub: false,
    };
    const sink = newSink();
    const ctx = this.ctx(frame, {}, {}, path, sink, new Set());
    const made = this.throwField(frame, ctx, path, sink, sheetId, check, { shift: 0, tags: [], against: null, versus });
    return { ...made, entries: sink.after };
  }

  private throwField(frame: Frame, ctx: Ctx, path: Path, sink: Sink, sheetId: string, check: Check,
    extra: { shift: number; tags: readonly string[]; against: string | null; versus?: number | null }): FieldThrow {
    const owner = frame.owner;
    const plain: Frame = { path: frame.path, effectId: '', label: frame.label, owner, home: sheetId, bound: null, args: {}, paramDefs: [], props: null, claims: {}, hop: frame.hop, inSub: frame.inSub };
    const judgeOf = (names: Record<string, unknown>, rolls: Record<string, RollResult> = {}) => this.ctx(plain, names, rolls, path, sink, new Set(Object.keys(names)));
    const sheetCtx = judgeOf({});
    const num = (ref: unknown, what: string) => sheetCtx.number(ref, what);
    const spec = parse(dieConstant(this.system, check.die), num);
    const slot = check.count !== undefined && check.count !== null ? 'count' : check.sides !== undefined && check.sides !== null ? 'sides'
      : check.bonus ? 'bonus' : check.threshold !== undefined && check.threshold !== null ? 'threshold' : null;
    if (extra.shift && slot === 'sides') throw new EngineError(`${owner}: число поля — грани кости; поправку к граням не прибавить — это правка броска`);
    if (extra.shift && slot === null) throw new EngineError(`${owner}: у броска нет числа поля — поправку прибавить не к чему`);
    const plus = (key: typeof slot): number => (slot === key ? extra.shift : 0);
    const count = check.count === undefined || check.count === null ? null : num(check.count, `${owner} · сколько костей`);
    const sides = check.sides === undefined || check.sides === null ? null : num(check.sides, `${owner} · грани`);
    const sized0 = count === null ? spec : withCount(spec, Math.max(0, count + plus('count')), owner);
    const counted = count !== null && check.zero ? { ...sized0, zero: check.zero } : sized0;
    const sides2 = check.sides2 === undefined || check.sides2 === null ? null : num(check.sides2, `${owner} · грани второй кости`);
    const sided = sides === null ? counted : withSides(counted, sides2 === null ? sides : [sides, sides2], owner);
    const sized = check.keep === undefined || check.keep === null ? sided : withKeep(sided, num(check.keep, `${owner} · сколько оставить`), owner);
    const field = check.bonus ? sheetCtx.optional(check.bonus, `${owner} · прибавка`) ?? 0 : 0;
    const bonus = field + plus('bonus');
    const tags = [...new Set([...(check.tags ?? []), ...extra.tags])];
    const asked = count !== null ? Math.max(0, count + plus('count')) : sides !== null ? sides : check.bonus ? bonus
      : check.threshold !== undefined && check.threshold !== null ? num(check.threshold, `${owner} · порог`) + plus('threshold') : null;
    const thrown = ctx.roll(sized, tags, sheetId, extra.against, check.bonus ? { ref: check.bonus, value: bonus } : undefined, { [NUMBER_NAME]: asked });
    let threshold: number | null = null;
    let base: number | null = null;
    const own = check.threshold !== undefined && check.threshold !== null;
    const given = extra.versus ?? null;
    if (own && given !== null) throw new EngineError(`${owner}: у броска свой порог — сложность меняют словом правки, а не числом`);
    if (own || given !== null) {
      const holders = this.holderViews();
      const view = (id: string) => holders.find(holder => holder.id === id)!.view;
      const shift = gather(holders, { call: ROLL_CALL, param: THRESHOLD_PARAM, tags: thrown.thrower?.tags ?? tags, names: { бросающий: sheetId, против: extra.against }, values: { [NUMBER_NAME]: asked }, view })
        .reduce((sum, held) => sum + amountOf(held), 0);
      const versus = thrown.roll.claim.versusShift * (check.under ? -1 : 1);
      base = own ? num(check.threshold, `${owner} · порог`) : given!;
      threshold = Math.max(0, base + plus('threshold') + shift + versus);
    }
    const number = check.under ? base : count ?? sides ?? (check.bonus ? field : base);
    const raw = thrown.result.total + bonus;
    const total = check.total
      ? judgeOf({ [ROLLED_NAME]: raw, [ROLL_NAME]: raw, [NUMBER_NAME]: number ?? 0 }, { [ROLL_NAME]: { ...thrown.result, total: raw } }).number(check.total, `${owner} · итог`)
      : raw;
    const named: Record<string, unknown> = { [ROLLED_NAME]: total, [ROLL_NAME]: total, [NUMBER_NAME]: number ?? 0, ...(threshold === null ? {} : { [THRESHOLD_NAME]: threshold }) };
    const self = { [ROLL_NAME]: { ...thrown.result, total } };
    const judge = judgeOf(named, self);
    const blind = (ref: unknown, ...names: string[]): boolean => {
      const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : '';
      return names.some(name => new RegExp(`@${name}(?![\\p{L}\\p{N}_])`, 'u').test(expr));
    };
    const waits = threshold === null ? [THRESHOLD_NAME] : [];
    const success = check.success && !blind(check.success, ...waits) ? judge.holds(check.success) : threshold === null ? null : check.under ? total <= threshold : total >= threshold;
    const reckoned = check.margin && !blind(check.margin, ...waits) ? judge.number(check.margin, `${owner} · степени`) : threshold === null ? null : check.under ? threshold - total : total - threshold;
    const margin = reckoned === null ? null : reckoned + thrown.roll.claim.degreeShift;
    const graded = judgeOf({ ...named, ...(success === null ? {} : { [SUCCESS_NAME]: success }), ...(margin === null ? {} : { [MARGIN_NAME]: margin }) }, self);
    const scale = check.degrees && !Array.isArray(check.degrees) ? check.degrees : null;
    if (scale?.of === 'margin' && reckoned === null) throw new EngineError(`${owner}: ступень по степеням, а степеней правило не считает — задайте порог или «Степени числом»`);
    const degree = scale
      ? String(lookupDegree(this.system, scale.table, scale.of === 'margin' ? reckoned : total, thrown.roll.claim.degreeShift, owner) ?? '') || null
      : (Array.isArray(check.degrees) ? check.degrees : []).filter(one => !blind(one.if, ...waits, ...(success === null ? [SUCCESS_NAME] : []), ...(margin === null ? [MARGIN_NAME] : []))).find(one => graded.holds(one.if))?.label ?? null;
    return { thrown, bonus, total, threshold, degree, success, margin, number };
  }

  private probeAsking<T>(work: () => T): T {
    this.seenAsks++;
    try {
      return this.probe(work);
    } finally {
      this.seenAsks--;
    }
  }

  private choose(question: Question): { chosen: string[]; skipped: boolean } {
    const live = (question.window === 'seen' || question.window === 'step') && this.seenAsks > 0 && this.probing === 1;
    const { chosen, byPerson } = this.isProbing && !live
      ? { chosen: this.ext.peek(question.key) ?? [], byPerson: false }
      : this.ext.ask(question);
    const unique = [...new Set(chosen)];
    const stray = unique.find(id => !question.offers.some(offer => offer.id === id));
    if (stray) throw new EngineError(`реакция «${stray}» сейчас не предлагается; можно: ${question.offers.map(o => o.id).join(', ') || '(ничего)'}`);
    return { chosen: unique, skipped: byPerson && !unique.length };
  }

  private question(sheetId: string, label: string, offers: readonly Offer[], path: Path, rolls: Record<string, RollResult>): string | null {
    const { chosen, skipped } = this.choose({
      key: path.key, sheetId, window: 'step', label, offers: [...offers], results: {}, one: true,
      preview: Object.entries(rolls).flatMap(([name, roll]) => (roll.dice?.rolls?.length ? [`${name}: ${ASK_ROLLED} ${roll.dice.rolls.join(', ')}`] : [])),
    });
    if (chosen.length > 1 || skipped) throw new EngineError(`${ASK_ONE_WORDS}: ${offers.map(offer => offer.label).join(' / ')}`);
    return chosen[0] ?? null;
  }

  private offers(sheetId: string, keys: readonly string[], names: Record<string, Bound>, seed: Record<string, unknown>,
    nested: readonly EmittedEvent[], qpath: Path, rolls: Record<string, RollResult> = {}): OfferFound[] {
    const sheet = this.sheet(sheetId);
    if (!sheet) return [];
    const byKey = new Map<string, OfferFound>();
    const add = (sub: Sub, subNames: Record<string, Bound>, subSeed: Record<string, unknown>, path: Path, subRolls: Record<string, RollResult>): void => {
      if (!this.holds(sub, subNames, subSeed, subRolls)) return;
      if (this.refusal(sub, path, subNames, subSeed, 0, subRolls)) return;
      const pick: Pick = { sub, names: subNames, seed: subSeed, rolls: subRolls };
      const known = byKey.get(sub.key);
      if (known) known.picks.push(pick);
      else byKey.set(sub.key, { offer: { id: sub.key, label: labelOf(sub) }, picks: [pick] });
    };
    const lastOf = new Map<string, EmittedEvent>();
    for (const one of nested) lastOf.set(one.event, one);
    const wanted = new Set(keys);
    for (const sub of this.subs(sheet)) {
      if (!sub.handler.confirm) continue;
      const on = sub.handler.on;
      const pay = qpath.pick(sub.key).pay();
      if (wanted.has(on)) {
        add(sub, names, seed, pay, rolls);
        continue;
      }
      if (!on.startsWith('after:')) continue;
      for (const event of lastOf.values()) {
        if (!keysOf(this.system, event.event, false).some(key => `after:${key}` === on)) continue;
        add(sub, event.names ?? {}, { ...(event.values ?? {}) }, pay, {});
      }
    }
    return [...byKey.values()];
  }

  private ask(question: Question, offers: OfferFound[], hop: number, path: Path): { entries: Entry[]; accepted: boolean } {
    const { chosen, skipped } = this.choose(question);
    const entries: Entry[] = [];
    let accepted = false;
    for (const id of chosen) {
      const found = offers.find(offer => offer.offer.id === id)!;
      const ready = (pick: Pick): boolean => {
        const live = this.live(pick.sub);
        return Boolean(live) && !this.refusal(live!, path.pick(id).pay(), pick.names, pick.seed, hop, pick.rolls);
      };
      const pick = found.picks.find(ready) ?? found.picks.find(one => this.live(one.sub)) ?? found.picks[0]!;
      const out = this.react(pick.sub, {
        path: path.pick(id), names: pick.names, seed: pick.seed, rolls: pick.rolls, hop, chosen: true,
        owner: `реакция «${labelOf(pick.sub)}»`,
      });
      entries.push(...out.lead);
      if (out.report) {
        entries.push({ fromId: pick.sub.sheetId, toId: pick.sub.sheetId, report: out.report });
        accepted = true;
      }
      entries.push(...out.entries);
    }
    if (skipped) entries.push({ text: `${this.sheet(question.sheetId)?.name ?? question.sheetId} пропускает реакцию` });
    return { entries, accepted };
  }

  window(window: Window, keys: readonly string[], names: Record<string, Bound>, seed: Record<string, unknown>, path: Path, label: string, rolls: Record<string, RollResult> = {}): Entry[] {
    const entries: Entry[] = [];
    for (const holder of this.holders()) {
      const qpath = path.ask(window, holder.id);
      const offers = this.offers(holder.id, keys, names, seed, [], qpath, rolls);
      if (!offers.length) continue;
      entries.push(...this.ask({
        key: qpath.key, sheetId: holder.id, window, label, offers: offers.map(found => found.offer), results: seed, preview: [],
      }, offers, 0, qpath).entries);
    }
    return entries;
  }

  seen(rollerId: string, againstId: string | null, roll: Roll, tags: readonly string[], path: Path, hop: number, sink: Sink, shown?: ShownBonus): Roll {
    if (this.seeing) return roll;
    const cell = { value: roll, bonus: shown?.value ?? 0 };
    const names: Record<string, Bound> = { бросающий: rollerId, против: againstId };
    const seed = (): Record<string, unknown> => {
      const now = result(cell.value);
      return {
        roll: {
          total: now.total + cell.bonus, natural: now.natural, rolls: now.dice.rolls, kept: now.dice.kept, parts: now.parts,
          rolled: now.rolled, atMax: now.atMax, atMin: now.atMin, edited: now.edited, tags: [...tags],
        },
      };
    };
    this.seeing++;
    try {
      for (const holder of this.holders()) {
        const sheetId = holder.id;
        const listening = (confirm: boolean): Sub[] => {
          const sheet = this.sheet(sheetId);
          if (!sheet) return [];
          return this.subs(sheet).filter(sub => sub.handler.on === 'seen' && Boolean(sub.handler.confirm) === confirm && tagsFit(sub.handler, tags));
        };
        for (const sub of listening(false)) {
          const out = this.react(sub, {
            path: path.phase('seen').handler(sheetId, sub.key, sub.inst), names, seed, hop, chosen: false,
            owner: `«${labelOf(sub)}» — увидев кости`, roll: cell,
          });
          sink.after.push(...out.lead);
          if (out.report) sink.after.push({ fromId: sheetId, toId: sheetId, report: out.report });
          sink.after.push(...out.entries);
        }
        const qpath = path.ask('seen', sheetId);
        const byKey = new Map<string, { offer: Offer; subs: Sub[] }>();
        for (const sub of listening(true)) {
          const full = seed();
          if (!this.holds(sub, names, full) || this.refusal(sub, qpath.pick(sub.key).pay(), names, full, hop)) continue;
          const known = byKey.get(sub.key);
          if (known) known.subs.push(sub);
          else byKey.set(sub.key, { offer: { id: sub.key, label: labelOf(sub) }, subs: [sub] });
        }
        if (!byKey.size) continue;
        const now = result(cell.value);
        const question: Question = {
          key: qpath.key, sheetId, window: 'seen', label: '', offers: [...byKey.values()].map(one => one.offer), results: seed(),
          preview: [`${rollTitle('Бросок', [...tags], this.system)}: [${now.dice.rolls.join(', ')}]${addendsText(cell.value.addends)}${shown ? ` + ${shown.label ? `${shown.label}: ` : ''}${shown.value}` : ''} → ${now.total + cell.bonus}${CALL_WORDS.roll.canceled(cell.value.canceled ?? [])}`],
        };
        const { chosen, skipped } = this.choose(question);
        for (const id of chosen) {
          const found = byKey.get(id)!;
          const pick = found.subs.find(sub => this.live(sub)) ?? found.subs[0]!;
          const out = this.react(pick, {
            path: qpath.pick(id), names, seed, hop, chosen: true, owner: `«${labelOf(pick)}» — увидев кости`, roll: cell,
          });
          sink.after.push(...out.lead);
          if (out.report) sink.after.push({ fromId: sheetId, toId: sheetId, report: out.report });
          sink.after.push(...out.entries);
        }
        if (skipped) sink.after.push({ text: `${this.sheet(sheetId)?.name ?? sheetId} пропускает реакцию` });
      }
      for (const holder of this.holders()) {
        const sheet = this.sheet(holder.id);
        if (!sheet) continue;
        for (const sub of this.subs(sheet).filter(one => one.handler.on === ROLLED && !one.handler.confirm && tagsFit(one.handler, tags))) {
          const out = this.react(sub, {
            path: path.phase(ROLLED).handler(holder.id, sub.key, sub.inst), names, seed, hop, chosen: false,
            owner: `«${labelOf(sub)}» — ${ROLLED_LABEL}`, roll: cell,
          });
          sink.after.push(...out.lead);
          if (out.report) sink.after.push({ fromId: holder.id, toId: holder.id, report: out.report });
          sink.after.push(...out.entries);
        }
      }
    } finally {
      this.seeing--;
    }
    return cell.value;
  }
}

export type { Window, Effect };
