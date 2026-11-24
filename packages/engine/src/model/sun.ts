import type { Compendium, Effect, Handler, Modifier, Param, Step, System } from './types.ts';
import { AND, NOT, OR, compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { registry, loopsAt, type StepData, type StepModule } from '../engine/steps/index.ts';
import { loopOf, loopParam } from '../engine/steps/each.ts';
import { flowOf, endOf } from './flow.ts';
import { isBlank } from './blank.ts';
import { namesAt, stepSaid, type NameAt, type Place } from './names-at.ts';
import { formulaDeps, listenerOf, contractsOf, HOLDER, DESK_NAME } from './references.ts';
import { heardLabel } from './lint.ts';
import { emittedChoices } from './payments.ts';
import { claimMarks, stepTagReach } from './roll-reach.ts';
import { keysOf } from '../core/subs.ts';
import { tagSaid } from '../engine/roll-tags.ts';
import { anyRowSays } from '../engine/tables.ts';
import { walkSheet } from './paths.ts';
import { flattenSystem } from './inherit.ts';
import { launchOf, DURATIONS, type LaunchKind } from './effect-kinds.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { NAMES, nameLabel } from '../words/names.ts';
import { ANY_ACTION, PHASES, type Phase } from '../events/happenings.ts';
import { SUN_STAGES, sunAfter, sunAsked, sunAttach, sunButton, sunDecides, sunDetach, sunEach, sunElse, sunIf, sunOf as fieldOn, sunPhase } from '../words/sun.ts';

export type SunKind = 'step' | 'heard' | 'input' | 'field' | 'result' | 'value' | 'call' | 'cost' | 'state' | 'tag' | 'seam' | 'ask' | 'stop' | 'aside';

export type SunStage = 'cost' | 'target' | 'roll' | 'check' | 'amount' | 'deliver' | 'then' | 'when' | 'onlyIf' | 'decides' | 'does' | 'while' | 'lasts';

export type SunPart = 'cost' | 'steps' | 'attach' | 'detach' | 'handler' | 'handler-cost' | 'handler-if' | 'handler-on' | 'handler-confirm' | 'modifiers' | 'duration';

export interface SunSpan { part: SunPart; handler?: number; from: number; to: number }

export interface SunRef { effect?: string; tags?: string[]; param?: string; field?: string; sheet?: string; step?: string; table?: string; constant?: string }

export type SunRole = 'reads' | 'sets' | 'calls' | 'gives' | 'meddle' | 'seam' | 'stand';

export interface MeddleEdit { source: string; table?: true; label: string; param: string; word?: string; needs: string[]; side: 'roller' | 'against' | 'any' }

export interface MeddleAsk { effect: string; handler: number; label: string; confirm: boolean }

export interface Meddle { call: string; tags: string[]; sure: string[]; open: boolean; edits: MeddleEdit[]; sources: string[]; asks: MeddleAsk[] }

export interface Seam {
  by: string;
  label: string;
  handler: number;
  phase: Phase;
  via: 'id' | 'tag' | 'any';
  key: string;
  confirm: boolean;
  manual: boolean;
  reads: string[];
  ray: string | null;
  side: 'before' | 'after';
  found: boolean;
}

export interface Stand { handler: number; effect: string; label: string; ray: string | null; rayLabel: string; number: number | null; phase: Phase; via: 'id' | 'tag' }

export interface SunBubble { kind: SunKind; role: SunRole; label: string; name?: string; ref?: SunRef; meddle?: Meddle; seam?: Seam; stand?: Stand }

export interface SunRay {
  key: string;
  number: number;
  stage: SunStage;
  kind: SunKind;
  label: string;
  span: SunSpan | null;
  repeat: boolean;
  under: string | null;
  group: number | null;
  condition?: string;
  bubbles: SunBubble[];
}

export interface Sun { effect: string; label: string; launch: LaunchKind; inputs: number; rays: SunRay[]; seams: Seam[]; stands: Stand[] }

const AFTER_KEY = 'after';
const DEPTH = 4;
const ROLES: readonly SunRole[] = ['reads', 'calls', 'meddle', 'gives', 'sets', 'stand', 'seam'];

type Bag = Record<string, unknown>;

const exprOf = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || !('expr' in value)) return null;
  const text = String((value as { expr: unknown }).expr ?? '').trim();
  return text || null;
};

export const exprsIn = (value: unknown, out: string[] = []): string[] => {
  if (!value || typeof value !== 'object') return out;
  const own = exprOf(value);
  if (own) { out.push(own); return out; }
  for (const item of Array.isArray(value) ? value : Object.values(value as Bag)) exprsIn(item, out);
  return out;
};

export const depsOf = (source: string): readonly string[] => formulaDeps(source) ?? [];

const astOf = (source: string): Node | null => {
  try { return compile(source).ast; } catch { return null; }
};

export const moduleOf = (step: { type?: unknown }): StepModule | undefined => registry.get(String(step.type));

const TAG_SLOTS: ReadonlySet<string> = new Set(['roll', 'tags']);
const CALL_SLOT = 'event';
const TAGS_PARAM = 'tags';

function slotOf(step: Step, fits: (kind: string) => boolean): unknown {
  const slot = ((moduleOf(step)?.slots ?? []) as { key: string; kind?: string }[]).find(one => fits(one.kind ?? ''));
  return slot ? (step as Bag)[slot.key] : undefined;
}

export const tagsSlot = (step: Step): unknown => slotOf(step, kind => TAG_SLOTS.has(kind));
export const callSlot = (step: Step): unknown => slotOf(step, kind => kind === CALL_SLOT);

interface Atom { from: number; to: number; fold: number | null; under: string | null; alt: boolean }

function atomsOf(steps: readonly Step[], keyOf: (index: number) => string): Atom[] {
  const out: Atom[] = [];
  const walk = (from: number, to: number, under: string | null): void => {
    let index = from;
    while (index <= to) {
      const flow = flowOf(steps[index]!.type);
      if (flow === 'close') { index += 1; continue; }
      if (flow !== 'open') { out.push({ from: index, to: index, fold: null, under, alt: flow === 'alt' }); index += 1; continue; }
      const close = Math.min(endOf(steps, index), to);
      const heads = [index];
      let depth = 0;
      for (let at = index; at <= close; at++) {
        const inner = flowOf(steps[at]!.type);
        if (inner === 'open') depth += 1;
        if (inner === 'close') depth -= 1;
        if (inner === 'alt' && depth === 1) heads.push(at);
      }
      const closed = flowOf(steps[close]!.type) === 'close';
      const last = closed ? close - 1 : close;
      if (heads.length === 1 && last === index + 1 && !flowOf(steps[last]!.type)) {
        out.push({ from: index, to: close, fold: last, under, alt: false });
        index = close + 1;
        continue;
      }
      heads.forEach((head, nth) => {
        out.push({ from: head, to: head, fold: null, under: nth ? keyOf(index) : under, alt: nth > 0 });
        walk(head + 1, (heads[nth + 1] ?? last + 1) - 1, keyOf(head));
      });
      index = close + 1;
    }
  };
  walk(0, steps.length - 1, null);
  return out;
}

interface Chain { part: 'cost' | 'steps' | 'attach' | 'detach' | 'handler' | 'handler-cost'; handler?: number; steps: readonly Step[]; prefix: string }

const placeAt = (chain: Chain, index: number): Place =>
  (chain.part === 'handler' || chain.part === 'handler-cost' ? { part: chain.part, handler: chain.handler ?? 0, index } : { part: chain.part, index });

interface Ctx { system: System; id: string; effect: Effect; compendium?: Compendium }

const loneName = (source: string): string | null => /^@([\p{L}\p{N}_.]+)$/u.exec(source.trim())?.[1] ?? null;

function fieldSaid(system: System, path: string): string {
  const walked = walkSheet(system, path);
  if (walked?.ok) return walked.label;
  const first = path.split('.')[0] ?? path;
  return (system.tables?.[first] as { label?: string } | undefined)?.label ?? first;
}

const sheetSaid = (named: NameAt | undefined, head: string): string => nameLabel(head) ?? named?.label ?? head;

function readBubble(ctx: Ctx, names: ReadonlyMap<string, NameAt>, dep: string): SunBubble | null {
  const dot = dep.indexOf('.');
  const head = dot > 0 ? dep.slice(0, dot) : dep;
  const rest = dot > 0 ? dep.slice(dot + 1) : '';
  const named = names.get(dep) ?? names.get(head);
  const exact = dot > 0 ? names.get(dep) : undefined;
  if (exact && exact.kind !== 'sheet') return { kind: 'field', role: 'reads', label: exact.label, name: dep, ref: { field: rest, sheet: head } };
  const sheet = named?.kind === 'sheet' || head === DESK_NAME || head === HOLDER;
  if (sheet) {
    const who = sheetSaid(named, head);
    if (!rest) return { kind: 'input', role: 'reads', label: who, name: head, ref: { param: head } };
    const worn = ctx.system.effects?.[rest];
    if (worn) return { kind: 'state', role: 'reads', label: fieldOn(worn.label ?? rest, who), name: dep, ref: { effect: rest, sheet: head } };
    return { kind: 'field', role: 'reads', label: fieldOn(fieldSaid(ctx.system, rest), who), name: dep, ref: { field: rest, sheet: head } };
  }
  if (!named) return null;
  if (named.group === 'constant') return { kind: 'value', role: 'reads', label: named.label, name: head, ref: { constant: head } };
  const child = rest ? named.children?.find(one => one.path === `.${rest}`) : undefined;
  if (named.group === 'input' || named.group === 'loop') {
    const asked = Boolean((ctx.effect.params ?? []).find(param => param.key === head && (param as { ask?: unknown }).ask));
    return { kind: asked ? 'aside' : 'input', role: 'reads', label: child ? `${named.label} · ${child.label}` : named.label, name: head, ref: { param: head } };
  }
  const said = named.said ?? named.label;
  return { kind: 'result', role: 'reads', label: child ? `${said} · ${child.label}` : said, name: head, ref: { step: head } };
}

const tagsSaid = (system: System, tags: readonly string[]): string => tags.map(tag => tagSaid(system, tag)).join(', ');

export const sureTags = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === 'string' && tag !== '') : []);

type Three = boolean | null;

function refutes(source: string | undefined, sure: ReadonlySet<string>, possible: ReadonlySet<string>, open: boolean): boolean {
  const ast = source ? astOf(source) : null;
  if (!ast) return false;
  const rollTags = `roll.${NAMES.tags}`;
  const visit = (node: Node): Three => {
    if (node.kind === 'Bool') return node.value;
    if (node.kind === 'Unary') {
      const inner = visit(node.operand);
      return node.op === NOT ? (inner === null ? null : !inner) : null;
    }
    if (node.kind === 'Binary') {
      if (node.op === AND) {
        const left = visit(node.left);
        const right = visit(node.right);
        return left === false || right === false ? false : left === true && right === true ? true : null;
      }
      if (node.op === OR) {
        const left = visit(node.left);
        const right = visit(node.right);
        return left === true || right === true ? true : left === false && right === false ? false : null;
      }
      return null;
    }
    if (node.kind === 'Call' && node.name === 'has' && node.args.length === 2) {
      const [list, item] = node.args as [Node, Node];
      if (list.kind !== 'Ref' || list.tag !== rollTags || item.kind !== 'Text') return null;
      if (sure.has(item.value)) return true;
      return possible.has(item.value) || open ? null : false;
    }
    return null;
  };
  return visit(ast) === false;
}

function sideOf(condition: string | undefined): 'roller' | 'against' | 'any' {
  const ast = condition ? astOf(condition) : null;
  if (!ast) return 'any';
  let found: 'roller' | 'against' | 'any' = 'any';
  const other = (a: Node, b: Node): string | null => (a.kind === 'Ref' && a.tag === HOLDER && b.kind === 'Ref' ? b.tag : null);
  const visit = (node: Node): void => {
    if (node.kind === 'Binary') {
      const name = node.op === '==' ? other(node.left, node.right) ?? other(node.right, node.left) : null;
      if (name === NAMES.roller) found = 'roller';
      else if (name === NAMES.against && found === 'any') found = 'against';
      visit(node.left);
      visit(node.right);
    } else if (node.kind === 'Unary') visit(node.operand);
    else if (node.kind === 'Call') node.args.forEach(visit);
    else if (node.kind === 'Conditional') { visit(node.test); visit(node.then); visit(node.otherwise); }
  };
  visit(ast);
  return found;
}

interface Sourced { mod: Modifier; source: string; label: string; table?: true }

function editsOfSystem(system: System, compendium?: Compendium): Sourced[] {
  const out: Sourced[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const mod of effect.modifiers ?? []) if (mod.kind === 'edit') out.push({ mod, source: id, label: effect.label ?? id });
  }
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    for (const mod of (table as { modifiers?: Modifier[] }).modifiers ?? []) if (mod.kind === 'edit') out.push({ mod, source: id, label: (table as { label?: string }).label ?? id, table: true });
  }
  for (const [id, kind] of Object.entries(system.sheets ?? {})) {
    for (const mod of (kind as { modifiers?: Modifier[] }).modifiers ?? []) if (mod.kind === 'edit') out.push({ mod, source: id, label: (kind as { label?: string }).label ?? id, table: true });
  }
  for (const record of [...(system.library ?? []), ...(compendium?.records ?? [])]) {
    for (const mod of record.modifiers ?? []) if (mod.kind === 'edit') out.push({ mod, source: record.id, label: (record as { name?: string }).name ?? record.id, table: true });
  }
  return out;
}

interface Reach { call: string; sure: ReadonlySet<string>; possible: ReadonlySet<string>; open: boolean }

function mayFit(system: System, mod: Modifier, reach: Reach): boolean {
  const spec = mod as { tags?: string[]; anyTags?: string[]; notTags?: string[]; where?: { table: string; column: string; is: unknown } };
  const can = (tag: string): boolean => reach.possible.has(tag) || reach.open;
  if (!(spec.tags ?? []).every(can)) return false;
  if (spec.anyTags?.length && !spec.anyTags.some(can)) return false;
  if ((spec.notTags ?? []).some(tag => reach.sure.has(tag))) return false;
  if (spec.where && !reach.open && !anyRowSays(system, [...reach.possible], spec.where)) return false;
  return !refutes(mod.if?.expr, reach.sure, reach.possible, reach.open);
}

function meddleOf(system: System, reach: Reach, compendium?: Compendium): Meddle {
  const edits: MeddleEdit[] = [];
  for (const { mod, source, label, table } of editsOfSystem(system, compendium)) {
    if (mod.kind !== 'edit' || mod.call !== reach.call || !mayFit(system, mod, reach)) continue;
    const word = (mod as { edit?: unknown }).edit;
    edits.push({
      source, label, param: String(mod.param ?? ''),
      ...(table ? { table: true as const } : {}),
      ...(typeof word === 'string' && word ? { word } : {}),
      needs: [...(mod.tags ?? []), ...((mod.anyTags ?? []).some(tag => reach.sure.has(tag)) ? [] : mod.anyTags ?? [])].filter(tag => !reach.sure.has(tag)),
      side: sideOf(mod.if?.expr),
    });
  }
  const asks: MeddleAsk[] = [];
  if (reach.call === ROLL_CALL) {
    for (const [id, effect] of Object.entries(system.effects ?? {})) {
      (effect.on ?? []).forEach((handler, index) => {
        const heard = listenerOf(handler);
        if (heard.kind !== 'seen' && heard.kind !== 'rolled') return;
        if (refutes(handler.if?.expr, reach.sure, reach.possible, reach.open)) return;
        asks.push({ effect: id, handler: index, label: effect.label ?? id, confirm: Boolean(handler.confirm) });
      });
    }
  }
  return {
    call: reach.call, tags: [...reach.possible], sure: [...reach.sure], open: reach.open,
    edits, sources: [...new Set(edits.map(edit => edit.source))], asks,
  };
}

export function mergeMeddle(list: readonly Meddle[]): Meddle | null {
  if (!list.length) return null;
  const edits: MeddleEdit[] = [];
  const asks: MeddleAsk[] = [];
  const seenEdit = new Set<string>();
  const seenAsk = new Set<string>();
  for (const one of list) {
    for (const edit of one.edits) {
      const key = `${edit.source}|${edit.param}|${edit.word ?? ''}|${edit.needs.join(',')}|${edit.side}`;
      if (!seenEdit.has(key)) { seenEdit.add(key); edits.push(edit); }
    }
    for (const ask of one.asks) {
      const key = `${ask.effect}|${ask.handler}`;
      if (!seenAsk.has(key)) { seenAsk.add(key); asks.push(ask); }
    }
  }
  return {
    call: list[0]!.call, tags: [...new Set(list.flatMap(one => one.tags))], sure: [...new Set(list.flatMap(one => one.sure))],
    open: list.some(one => one.open), edits, sources: [...new Set(edits.map(edit => edit.source))], asks,
  };
}

function rollReach(system: System, params: readonly Param[], step: Step, compendium?: Compendium): Reach {
  const raw = tagsSlot(step);
  const found = stepTagReach(system, params, raw, compendium);
  const sure = new Set(sureTags(raw));
  const possible = new Set([...found.tags, ...sure, ...claimMarks(system).map(([mark]) => mark)]);
  let open = found.open;
  const marking = editsOfSystem(system, compendium).filter(({ mod }) => mod.kind === 'edit' && mod.call === ROLL_CALL && mod.param === TAGS_PARAM);
  for (let grown = true; grown;) {
    grown = false;
    for (const { mod } of marking) {
      if (!mayFit(system, mod, { call: ROLL_CALL, sure, possible, open })) continue;
      const added = stepTagReach(system, [], [(mod as { value?: unknown }).value], compendium);
      if (added.open && !open) { open = true; grown = true; }
      for (const tag of added.tags) if (!possible.has(tag)) { possible.add(tag); grown = true; }
    }
  }
  return { call: ROLL_CALL, sure, possible, open };
}

function rollsWithin(system: System, effectId: string, compendium: Compendium | undefined, depth: number, seen: Set<string>): Meddle[] {
  const effect = system.effects?.[effectId];
  if (!effect || depth > DEPTH || seen.has(effectId)) return [];
  const path = new Set([...seen, effectId]);
  const out: Meddle[] = [];
  for (const steps of [effect.cost ?? [], effect.steps ?? []]) {
    for (const step of steps) {
      const mod = moduleOf(step);
      if (mod?.dice?.(step as StepData)) out.push(meddleOf(system, rollReach(system, effect.params ?? [], step, compendium), compendium));
      const called = mod?.calls ? emittedChoices(system, effectId, callSlot(step), compendium) : [];
      for (const next of called) out.push(...rollsWithin(system, next, compendium, depth + 1, path));
    }
  }
  return out;
}

function callReach(system: System, ctx: Ctx, callee: string, step: Step): Reach {
  const raw = tagsSlot(step);
  const own = stepTagReach(system, ctx.effect.params ?? [], raw, ctx.compendium);
  const fixed = [...keysOf(system, callee, false).slice(1), ...sureTags(raw)];
  return { call: callee, sure: new Set(fixed), possible: new Set([...fixed, ...own.tags]), open: true };
}

function meddleAt(ctx: Ctx, step: Step): Meddle | null {
  const mod = moduleOf(step);
  if (mod?.dice?.(step as StepData)) return meddleOf(ctx.system, rollReach(ctx.system, ctx.effect.params ?? [], step, ctx.compendium), ctx.compendium);
  if (!mod?.calls) return null;
  const callees = emittedChoices(ctx.system, ctx.id, callSlot(step), ctx.compendium);
  const rolls = mergeMeddle(callees.flatMap(callee => rollsWithin(ctx.system, callee, ctx.compendium, 1, new Set([ctx.id]))));
  if (rolls && (rolls.sources.length || rolls.asks.length)) return rolls;
  const amounts = callees.filter(callee => (ctx.system.effects?.[callee]?.params ?? []).some(param => param.role === 'amount'));
  const direct = mergeMeddle(amounts.map(callee => meddleOf(ctx.system, callReach(ctx.system, ctx, callee, step), ctx.compendium)));
  return direct && direct.sources.length ? direct : null;
}

export function rollMeddle(raw: System, effectId: string, place: Place, compendium?: Compendium): Meddle | null {
  const system = flattenSystem(raw, true);
  const effect = system.effects?.[effectId];
  if (!effect) return null;
  const steps = place.part === 'steps' || place.part === 'cost' || place.part === 'attach' || place.part === 'detach' ? effect[place.part]
    : place.part === 'handler' ? effect.on?.[place.handler]?.steps
      : place.part === 'handler-cost' ? effect.on?.[place.handler]?.cost : undefined;
  const step = 'index' in place ? steps?.[place.index] : undefined;
  return step ? meddleAt({ system, id: effectId, effect, ...(compendium ? { compendium } : {}) }, step) : null;
}

function stepBubbles(ctx: Ctx, chain: Chain, index: number): SunBubble[] {
  const step = chain.steps[index]!;
  const mod = moduleOf(step);
  const names = new Map(namesAt(ctx.system, ctx.id, placeAt(chain, index)).map(one => [one.name, one] as const));
  const inCost = chain.part === 'cost' || chain.part === 'handler-cost';
  const out: SunBubble[] = [];
  const reads = (value: unknown): void => {
    for (const source of exprsIn(value)) for (const dep of depsOf(source)) {
      const bubble = readBubble(ctx, names, dep);
      if (bubble) out.push(bubble);
    }
  };
  for (const slot of (mod?.slots ?? []) as { key: string; kind?: string; refersTo?: string }[]) {
    const value = (step as Bag)[slot.key];
    if (isBlank(value)) continue;
    const refers = mod?.slotRefers?.(step as StepData, slot.key) ?? slot.refersTo;
    if (slot.kind === CALL_SLOT || refers === 'effect') {
      reads(value);
      for (const id of emittedChoices(ctx.system, ctx.id, value, ctx.compendium).slice(0, 3)) {
        const kind: SunKind = slot.kind === CALL_SLOT ? (inCost ? 'cost' : 'call') : 'state';
        out.push({ kind, role: slot.kind === CALL_SLOT ? 'calls' : 'sets', label: ctx.system.effects?.[id]?.label ?? id, name: id, ref: { effect: id } });
      }
      continue;
    }
    if (TAG_SLOTS.has(slot.kind ?? '')) {
      const reach = stepTagReach(ctx.system, ctx.effect.params ?? [], value, ctx.compendium);
      const sure = sureTags(value);
      const tags = [...new Set([...sure, ...reach.tags])];
      const shown = sure.length ? sure : tags.slice(0, 3);
      const more = tags.length - shown.length;
      if (tags.length) out.push({ kind: 'tag', role: 'sets', label: `${tagsSaid(ctx.system, shown)}${more > 0 ? ` +${more}` : ''}`, name: tags.join(','), ref: { tags } });
      continue;
    }
    if (mod?.writes === slot.key) {
      const source = exprOf(value);
      const target = source ? loneName(source) : null;
      const dot = target ? target.indexOf('.') : -1;
      if (target && dot > 0) {
        const head = target.slice(0, dot);
        const rest = target.slice(dot + 1);
        const named = names.get(head);
        out.push({ kind: 'field', role: 'sets', label: fieldOn(fieldSaid(ctx.system, rest), sheetSaid(named, head)), name: `=${target}`, ref: { field: rest, sheet: head } });
      } else reads(value);
      continue;
    }
    if (refers === 'constant' && typeof value === 'string') {
      const constant = ctx.system.constants?.[value] as { label?: string } | undefined;
      out.push({ kind: 'value', role: 'reads', label: constant?.label ?? value, name: value, ref: { constant: value } });
      continue;
    }
    if (refers === 'table' && typeof value === 'string') {
      const table = ctx.system.tables?.[value] as { label?: string } | undefined;
      out.push({ kind: 'value', role: 'reads', label: table?.label ?? value, name: value, ref: { table: value } });
      continue;
    }
    if (slot.kind === 'input' && typeof value === 'string') {
      const param = (ctx.effect.params ?? []).find(one => one.key === value);
      if (param) out.push({ kind: 'input', role: 'reads', label: param.label ?? value, name: value, ref: { param: value } });
      continue;
    }
    reads(value);
  }
  const id = typeof step.id === 'string' ? step.id : '';
  if (id && chain.part === 'steps') {
    const given = (ctx.effect.returns ?? []).filter(column => depsOf(exprOf(column.expr) ?? '').some(dep => dep === id || dep.startsWith(`${id}.`)));
    if (given.length) out.push({ kind: 'result', role: 'gives', label: given.map(column => column.label ?? column.key).join(' · '), name: `>${id}`, ref: { step: id } });
  }
  const meddle = meddleAt(ctx, step);
  if (meddle && (meddle.sources.length || meddle.asks.length)) {
    out.push({ kind: 'seam', role: 'meddle', label: `${meddle.sources.length} · ${meddle.asks.length}`, name: '~meddle', meddle });
  }
  return out;
}

function tidy(bubbles: readonly SunBubble[]): SunBubble[] {
  const seen = new Set<string>();
  const unique = bubbles.filter(one => {
    const key = `${one.role}|${one.kind}|${one.name ?? one.label}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return ROLES.flatMap(role => unique.filter(one => one.role === role));
}

function stageOf(step: Step): SunStage {
  const stage = moduleOf(step)?.stage?.(step as StepData);
  return stage && stage in SUN_STAGES ? (stage as SunStage) : 'deliver';
}

function conditionLabel(ctx: Ctx, chain: Chain, index: number, source: string | null): string {
  const lone = source ? loneName(source) : null;
  if (!lone) return sunIf();
  const names = new Map(namesAt(ctx.system, ctx.id, placeAt(chain, index)).map(one => [one.name, one] as const));
  const bubble = readBubble(ctx, names, lone);
  if (!bubble) return sunIf();
  const dot = lone.indexOf('.');
  const named = dot > 0 ? names.get(lone.slice(0, dot)) : undefined;
  const child = named?.children?.find(one => one.path === `.${lone.slice(dot + 1)}`)?.label;
  const short = child && child.split(' ').length <= 2 ? child : named?.said ?? named?.label;
  return sunAsked(short ?? bubble.label);
}

function stepLabel(ctx: Ctx, step: Step, stage: SunStage): string {
  if (typeof step.label === 'string' && step.label) return step.label;
  const mod = moduleOf(step);
  if (mod?.calls) {
    const called = emittedChoices(ctx.system, ctx.id, callSlot(step), ctx.compendium)[0];
    const label = called ? ctx.system.effects?.[called]?.label : undefined;
    if (label) return label;
  }
  if (loopsAt(step)) {
    const loop = loopOf(ctx.effect.params ?? [], step as { of?: unknown }) ?? loopParam(step as never);
    if (loop?.label) return sunEach(loop.label);
  }
  if (typeof step.id === 'string' && step.id) return stepSaid(step);
  const words = (mod as { label?: string } | undefined)?.label;
  return words && !mod?.flow ? words.toLocaleLowerCase() : SUN_STAGES[stage];
}

function chainRays(ctx: Ctx, chain: Chain, base: SunStage | null, group: number | null, bare = false): { rays: SunRay[]; rayOf: Map<number, string> } {
  const keyOf = (index: number): string => `${chain.prefix}${index}`;
  const rays: SunRay[] = [];
  const rayOf = new Map<number, string>();
  let repeat = false;
  let rolled = false;
  const atoms = atomsOf(chain.steps, keyOf);
  const lastBlock = atoms.reduce((at, atom, nth) => (atom.under === null && (atom.fold !== null || flowOf(chain.steps[atom.from]!.type) === 'open') ? nth : at), -1);
  atoms.forEach((atom, nth) => {
    const head = chain.steps[atom.from]!;
    const body = atom.fold === null ? head : chain.steps[atom.fold]!;
    const mod = moduleOf(body);
    const flow = flowOf(head.type);
    const inCost = chain.part === 'cost' || chain.part === 'handler-cost';
    const halts = mod?.halts?.(body as StepData, inCost);
    const kind: SunKind = halts?.kind ?? (mod?.asks ? 'ask' : 'step');
    let stage = stageOf(body);
    if (mod?.dice?.(body as StepData)) {
      if (rolled) stage = 'amount';
      rolled = true;
    } else if (mod?.calls && typeof body.id === 'string' && body.id) {
      const called = emittedChoices(ctx.system, ctx.id, callSlot(body), ctx.compendium)[0];
      const callee = called ? ctx.system.effects?.[called] : undefined;
      if (callee?.returns?.length) {
        const throws = (callee.steps ?? []).some(step => moduleOf(step)?.dice?.(step as StepData));
        stage = throws ? 'roll' : 'amount';
        if (throws) rolled = true;
      }
    }
    if (base) stage = base;
    else if (stage === 'deliver' && atom.under === null && lastBlock >= 0 && nth > lastBlock) stage = 'then';
    const condition = flow ? exprOf((head as Bag).if) : null;
    const note = halts ? exprOf(halts.note)?.replace(/^"|"$/gu, '') : undefined;
    if (halts) stage = 'check';
    const label = note ? note
      : flow === 'alt' && !condition ? sunElse()
        : flow ? (atom.fold === null || kind !== 'step' ? conditionLabel(ctx, chain, atom.from, condition) : stepLabel(ctx, body, stage))
          : stepLabel(ctx, body, stage);
    const bubbles = bare ? [] : [
      ...stepBubbles(ctx, chain, atom.from),
      ...(atom.fold === null ? [] : stepBubbles(ctx, chain, atom.fold)),
    ];
    const key = keyOf(atom.from);
    for (let at = atom.from; at <= atom.to; at++) rayOf.set(at, key);
    rays.push({
      key, number: 0, stage, kind, label,
      span: { part: chain.part, ...(chain.handler === undefined ? {} : { handler: chain.handler }), from: atom.from, to: atom.to },
      repeat, under: atom.under, group,
      ...(condition ? { condition } : {}),
      bubbles: tidy(bubbles),
    });
    if (chain.part === 'steps' && atom.under === null && loopsAt(head)) repeat = true;
  });
  return { rays, rayOf };
}

function costRay(ctx: Ctx, chain: Chain, group: number | null, bare = false): SunRay | null {
  if (!chain.steps.length) return null;
  const bubbles = bare ? [] : chain.steps.flatMap((_, index) => stepBubbles(ctx, chain, index));
  for (const step of bare ? [] : chain.steps) {
    const halts = moduleOf(step)?.halts?.(step as StepData, true);
    const note = halts ? exprOf(halts.note) : null;
    if (halts) bubbles.push({ kind: halts.kind, role: 'sets', label: note ? note.replace(/^"|"$/gu, '') : SUN_STAGES.cost, name: `!${halts.kind}` });
  }
  return {
    key: `${chain.prefix}cost`, number: 0, stage: 'cost', kind: 'cost', label: SUN_STAGES.cost,
    span: { part: chain.part, ...(chain.handler === undefined ? {} : { handler: chain.handler }), from: 0, to: chain.steps.length - 1 },
    repeat: false, under: null, group, bubbles: tidy(bubbles),
  };
}

interface Frame { rays: SunRay[]; rayOf: Map<number, string> }

function buttonFrame(ctx: Ctx, bare = false): Frame {
  const cost = costRay(ctx, { part: 'cost', steps: ctx.effect.cost ?? [], prefix: 'cost:' }, null, bare);
  const body = chainRays(ctx, { part: 'steps', steps: ctx.effect.steps ?? [], prefix: 'steps:' }, null, null, bare);
  return { rays: [...(cost ? [cost] : []), ...body.rays], rayOf: body.rayOf };
}

const numbered = (frame: Frame): Frame => {
  frame.rays.forEach((ray, index) => { ray.number = index + 1; });
  return frame;
};

function handlerRays(ctx: Ctx, handler: Handler, index: number): SunRay[] {
  const prefix = `on${index}:`;
  const heard = listenerOf(handler);
  const out: SunRay[] = [];
  const phase = heard.kind === 'call' ? PHASES[heard.phase].label : '';
  const what = heard.kind === 'call' && heard.key === ANY_ACTION ? '*' : heardLabel(ctx.system, heard);
  out.push({
    key: `${prefix}when`, number: 0, stage: 'when', kind: 'heard', label: phase ? sunPhase(phase, what) : what || SUN_STAGES.when,
    span: { part: 'handler-on', handler: index, from: 0, to: 0 }, repeat: false, under: null, group: index, bubbles: [],
  });
  const condition = exprOf(handler.if);
  if (condition) {
    const names = new Map(namesAt(ctx.system, ctx.id, { part: 'handler-if', handler: index }).map(one => [one.name, one] as const));
    const bubbles = depsOf(condition).map(dep => readBubble(ctx, names, dep)).filter((one): one is SunBubble => Boolean(one));
    out.push({
      key: `${prefix}if`, number: 0, stage: 'onlyIf', kind: 'step', label: SUN_STAGES.onlyIf,
      span: { part: 'handler-if', handler: index, from: 0, to: 0 }, repeat: false, under: null, group: index, condition, bubbles: tidy(bubbles),
    });
  }
  const manual = Boolean((handler as { manual?: unknown }).manual);
  if (handler.confirm || manual) {
    out.push({
      key: `${prefix}confirm`, number: 0, stage: 'decides', kind: 'ask', label: handler.confirm ? sunDecides() : sunButton(),
      span: { part: 'handler-confirm', handler: index, from: 0, to: 0 }, repeat: false, under: null, group: index,
      bubbles: handler.confirm && manual ? [{ kind: 'ask', role: 'sets', label: sunButton(), name: '!manual' }] : [],
    });
  }
  const cost = costRay(ctx, { part: 'handler-cost', handler: index, steps: handler.cost ?? [], prefix }, index);
  if (cost) out.push(cost);
  out.push(...chainRays(ctx, { part: 'handler', handler: index, steps: handler.steps ?? [], prefix: `${prefix}steps:` }, 'does', index).rays);
  return out;
}

function passiveRays(ctx: Ctx): SunRay[] {
  const effect = ctx.effect;
  const out: SunRay[] = (effect.on ?? []).flatMap((handler, index) => handlerRays(ctx, handler, index));
  for (const part of ['attach', 'detach'] as const) {
    const rays = chainRays(ctx, { part, steps: effect[part] ?? [], prefix: `${part}:` }, 'does', null).rays;
    rays.forEach((ray, nth) => { if (!nth && ray.kind === 'step' && !ray.condition) ray.label = `${part === 'attach' ? sunAttach() : sunDetach()}: ${ray.label}`; });
    out.push(...rays);
  }
  const mods = effect.modifiers ?? [];
  if (mods.length) {
    const bubbles: SunBubble[] = mods.map((mod, index) => {
      if (mod.kind !== 'edit') {
        const target = String((mod as { target?: unknown }).target ?? '');
        return { kind: 'field' as const, role: 'sets' as const, label: fieldSaid(ctx.system, target.replace(/^cell:/u, '')), name: `m${index}`, ref: { field: target } };
      }
      if (mod.call === ROLL_CALL) {
        const tags = [...(mod.tags ?? []), ...(mod.anyTags ?? [])];
        const word = (ctx.system.roll_edits as Record<string, { label?: string }> | undefined)?.[String((mod as { edit?: unknown }).edit ?? '')]?.label;
        const said = tags.length ? tagsSaid(ctx.system, tags) : SUN_STAGES.roll;
        return { kind: 'tag' as const, role: 'sets' as const, label: word ? `${word}: ${said}` : said, name: `m${index}`, ref: { tags } };
      }
      return { kind: 'call' as const, role: 'sets' as const, label: ctx.system.effects?.[mod.call]?.label ?? mod.call, name: `m${index}`, ref: { effect: mod.call } };
    });
    out.push({
      key: 'while', number: 0, stage: 'while', kind: 'step', label: SUN_STAGES.while,
      span: { part: 'modifiers', from: 0, to: mods.length - 1 }, repeat: false, under: null, group: null, bubbles: tidy(bubbles),
    });
  }
  const duration = effect.duration as { kind?: string } | undefined;
  if (duration?.kind && duration.kind !== 'permanent') {
    const words = (DURATIONS as Record<string, { label: string } | undefined>)[duration.kind];
    out.push({
      key: 'lasts', number: 0, stage: 'lasts', kind: 'step', label: words?.label ?? SUN_STAGES.lasts,
      span: { part: 'duration', from: 0, to: 0 }, repeat: false, under: null, group: null, bubbles: [],
    });
  }
  return out;
}

function frameOf(ctx: Ctx): Frame {
  const button = buttonFrame(ctx);
  return numbered({ rays: [...button.rays, ...passiveRays(ctx)], rayOf: button.rayOf });
}

function seamsIn(ctx: Ctx, frame: Frame): Seam[] {
  const { system, id, effect } = ctx;
  const keys = keysOf(system, id, true);
  const steps = effect.steps ?? [];
  const idAt = new Map(steps.flatMap((step, index) => (typeof step.id === 'string' && step.id ? [[step.id, index] as const] : [])));
  const loopAt = steps.findIndex(step => loopsAt(step));
  const loopName = loopAt >= 0 ? loopOf(effect.params ?? [], steps[loopAt] as { of?: unknown })?.key : undefined;
  const eachNames = new Set([...(loopName ? [loopName] : []), ...keys.flatMap(key => contractsOf(system, key).flatMap(contract => (contract.each ? [contract.each] : [])))]);
  const numberOf = new Map(frame.rays.map(ray => [ray.key, ray.number] as const));
  const giver = new Map<string, number[]>();
  for (const column of effect.returns ?? []) {
    const heads = depsOf(exprOf(column.expr) ?? '').map(dep => dep.split('.')[0]!);
    giver.set(column.key, heads.flatMap(head => (idAt.has(head) ? [idAt.get(head)!] : [])));
  }
  const firstRoll = frame.rays.find(ray => ray.stage === 'roll' && ray.span?.part === 'steps') ?? frame.rays.find(ray => ray.span?.part === 'steps') ?? frame.rays[0];
  const out: Seam[] = [];
  for (const [by, other] of Object.entries(system.effects ?? {})) {
    (other.on ?? []).forEach((handler, index) => {
      const heard = listenerOf(handler);
      if (heard.kind !== 'call' || !keys.includes(heard.key)) return;
      const via = heard.key === id ? 'id' : heard.key === ANY_ACTION ? 'any' : 'tag';
      const reads = [...new Set(depsOf(exprOf(handler.if) ?? '').map(dep => dep.split('.')[0]!))];
      const at: number[] = [];
      if (heard.phase !== 'done') {
        for (const name of reads) {
          if (giver.has(name)) at.push(...giver.get(name)!);
          else if (eachNames.has(name) && loopAt >= 0) at.push(loopAt);
          else if (via === 'id' && idAt.has(name)) at.push(idAt.get(name)!);
        }
      }
      const placed = at.map(step => frame.rayOf.get(step)).filter((key): key is string => Boolean(key))
        .sort((a, b) => (numberOf.get(b) ?? 0) - (numberOf.get(a) ?? 0))[0];
      const fallback = heard.phase === 'before' ? firstRoll?.key ?? null : AFTER_KEY;
      out.push({
        by, label: other.label ?? by, handler: index, phase: heard.phase, via, key: heard.key,
        confirm: Boolean(handler.confirm), manual: Boolean((handler as { manual?: unknown }).manual), reads,
        ray: placed ?? fallback, side: placed || heard.phase !== 'before' ? 'after' : 'before', found: Boolean(placed),
      });
    });
  }
  return out;
}

const ctxOf = (raw: System, effectId: string, compendium?: Compendium): Ctx | null => {
  const system = flattenSystem(raw, true);
  const effect = system.effects?.[effectId];
  return effect ? { system, id: effectId, effect, ...(compendium ? { compendium } : {}) } : null;
};

export function seamsOf(raw: System, effectId: string, compendium?: Compendium): Seam[] {
  const ctx = ctxOf(raw, effectId, compendium);
  return ctx ? seamsIn(ctx, numbered(buttonFrame(ctx, true))) : [];
}

export function standsOf(raw: System, effectId: string, compendium?: Compendium): Stand[] {
  const ctx = ctxOf(raw, effectId, compendium);
  if (!ctx) return [];
  const out: Stand[] = [];
  (ctx.effect.on ?? []).forEach((handler, index) => {
    const heard = listenerOf(handler);
    if (heard.kind !== 'call' || heard.key === ANY_ACTION) return;
    for (const other of Object.keys(ctx.system.effects ?? {})) {
      if (!keysOf(ctx.system, other, false).includes(heard.key)) continue;
      const there = ctxOf(ctx.system, other, compendium)!;
      const frame = numbered(buttonFrame(there, true));
      const seam = seamsIn(there, frame).find(one => one.by === effectId && one.handler === index);
      if (!seam) continue;
      const ray = frame.rays.find(one => one.key === seam.ray);
      out.push({
        handler: index, effect: other, label: there.effect.label ?? other, ray: seam.ray, rayLabel: ray?.label ?? sunAfter(),
        number: ray?.number ?? null, phase: seam.phase, via: seam.via === 'id' ? 'id' : 'tag',
      });
    }
  });
  return out;
}

export function sunOf(raw: System, effectId: string, compendium?: Compendium): Sun | null {
  const ctx = ctxOf(raw, effectId, compendium);
  if (!ctx) return null;
  const frame = frameOf(ctx);
  const seams = seamsIn(ctx, frame);
  if (seams.some(seam => seam.ray === AFTER_KEY)) {
    frame.rays.push({ key: AFTER_KEY, number: frame.rays.length + 1, stage: 'then', kind: 'step', label: sunAfter(), span: null, repeat: false, under: null, group: null, bubbles: [] });
  }
  const byKey = new Map(frame.rays.map(ray => [ray.key, ray] as const));
  for (const seam of seams) {
    const ray = seam.ray ? byKey.get(seam.ray) : undefined;
    if (!ray) continue;
    const bubble: SunBubble = { kind: 'seam', role: 'seam', label: seam.label, name: `${seam.by}#${seam.handler}`, ref: { effect: seam.by }, seam };
    if (seam.side === 'before') ray.bubbles.unshift(bubble);
    else ray.bubbles.push(bubble);
  }
  const stands = standsOf(ctx.system, effectId, compendium);
  for (const stand of stands) {
    const ray = byKey.get(`on${stand.handler}:when`);
    if (ray) ray.bubbles.push({ kind: 'seam', role: 'stand', label: `${stand.label} › ${stand.rayLabel}`, name: `${stand.effect}@${stand.ray ?? ''}`, ref: { effect: stand.effect }, stand });
  }
  return {
    effect: effectId, label: ctx.effect.label ?? effectId, launch: launchOf(ctx.effect).kind,
    inputs: (ctx.effect.params ?? []).length, rays: frame.rays, seams, stands,
  };
}
