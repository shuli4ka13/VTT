import { flattenSystem } from './inherit.ts';
import { armsOf, sees } from './flow.ts';
import { paymentsOf } from './payments.ts';
import { loopOf, loopParam, splits as splitsTargets } from '../engine/steps/each.ts';
import { tagWords } from '../engine/roll-tags.ts';
import { ROLL_CALL } from '../words/calls.ts';
import type { System, Compendium, Effect, Step, Modifier, Guard, Param, Table } from './types.ts';
import { compile, FUNCTION_NAMES } from '../formula/index.ts';
import { isFormulaCell } from './sheet-columns.ts';
import type { Node } from '../formula/index.ts';
import { registry } from '../engine/steps/index.ts';
import { recordsOf, recordKinds, kindsOf } from './owned.ts';
import { VALUE_COLUMN } from './tables.ts';

export { MOMENT_PREFIX, FIELD_PREFIX } from '../events/bus.ts';
import { MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX, ANY_ACTION, callHappening, SEEN, ROLLED } from '../events/bus.ts';
import type { Phase } from '../events/bus.ts';
import { fieldsOf, fieldLinkOf } from './sheet-columns.ts';

export const CALL_TAGS = 'метки';

const TURN_MOMENTS = new Set(['turn-start', 'turn-end']);

export const HOLDER = 'носитель';

export { ITEM_NAME } from './item-ref.ts';
import { ITEM_NAME } from './item-ref.ts';

export const DESK_NAME = 'стол';

export const LISTEN = 'listen';

export type Tab = 'sheet' | 'rules' | 'effects' | 'records' | 'book';

export interface Where {
  tab: Tab;
  field?: string;
  effect?: string;
  step?: number;
  kind?: string;
  binding?: number;
  record?: string;
  section?: string;
  key?: string;
  part?: string;
  handler?: number;
}

export type RefKind =
  | 'field' | 'effect' | 'constant' | 'table' | 'rollEdit' | 'event' | 'roll' | 'tag'
  | 'param' | 'step' | 'prop' | 'recordKind' | 'syntax';

export interface Reference {
  kind: RefKind;
  key: string;
  from: Where;
  scope?: string;
  path?: string;
  near?: string[];
}

export interface Declared {
  field: Set<string>;
  effect: Set<string>;
  constant: Set<string>;
  table: Set<string>;
  rollEdit: Set<string>;
  event: Set<string>;
  roll: Set<string>;
  tag: Set<string>;
  prop: Set<string>;
  recordKind: Set<string>;
  column: Set<string>;
  tableLabel: Map<string, string>;
}

export function declaredOf(system: System): Declared {
  return {
    field: new Set(fieldsOf(system).map(f => f.tag)),
    effect: new Set(Object.keys(system.effects ?? {})),
    constant: new Set(Object.keys(system.constants ?? {})),
    table: new Set(Object.keys(system.tables ?? {})),
    rollEdit: new Set(Object.keys(system.roll_edits ?? {})),
    event: new Set(Object.keys(system.effects ?? {})),
    roll: new Set(tagWords(system).keys()),
    tag: new Set([
      ...tagWords(system).keys(),
      ...Object.values(system.tables ?? {}).flatMap(table => (table.rows ?? []).map(row => String(row.value))),
      ...Object.keys(system.tags ?? {}),
      ...Object.values(system.effects ?? {}).flatMap(effect => effect.tags ?? []),
    ]),
    prop: new Set(recordKinds(system).flatMap(([, k]) => (k.columns ?? []).map(p => p.key))),
    recordKind: new Set(kindsOf(system).map(([id]) => id)),
    column: new Set(Object.entries(system.tables ?? {}).flatMap(([id, table]) => [VALUE_COLUMN, ...(table.columns ?? []).map(c => c.key)].map(key => `${id}.${key}`))),
    tableLabel: new Map(Object.entries(system.tables ?? {}).map(([id, table]) => [id, table.label || id])),
  };
}

export const formulaDeps = (source: string): readonly string[] | null => {
  try { return compile(source).deps; } catch { return null; }
};

const readPath = (step: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) =>
    (node == null || typeof node !== 'object' ? undefined : (node as Record<string, unknown>)[key]), step);

export interface ChainScope {
  params: Set<string>;
  earlier: Set<string>;
  sheets: Set<string>;
  bare: boolean;
  later?: Set<string>;
  rows?: ReadonlyMap<string, string>;
}

export const sheetScope = (params: Set<string>, sheets: Iterable<string>, earlier: Iterable<string> = []): ChainScope =>
  ({ params, earlier: new Set(earlier), sheets: new Set(sheets), bare: true });

export const plainScope = (): ChainScope => ({ params: new Set(), earlier: new Set(), sheets: new Set(), bare: false });

function slotRefs(value: unknown, slotKind: string | undefined, from: Where, scope: ChainScope, out: Reference[]): void {
  if (value === null || value === undefined) return;
  if (slotKind === 'event') {
    if (typeof value === 'string' && value) out.push({ kind: 'event', key: value, from });
    return;
  }
  if (slotKind === 'args') {
    for (const arg of Object.values((value ?? {}) as Record<string, unknown>)) slotRefs(arg, undefined, from, scope, out);
    return;
  }
  if (slotKind === 'roll') {
    for (const tag of Array.isArray(value) ? value : [value]) {
      if (typeof tag === 'string') { if (tag) out.push({ kind: 'roll', key: tag, from }); }
      else slotRefs(tag, undefined, from, scope, out);
    }
    return;
  }
  if (typeof value === 'string') {
    const kind = NAMED[slotKind ?? ''];
    if (kind && value) out.push({ kind, key: value, from });
    return;
  }
  if (typeof value !== 'object') return;
  const r = value as Record<string, unknown>;
  if ('expr' in r) exprRefs(String(r.expr ?? ''), from, scope, out);
}

const NAMED: Record<string, RefKind> = { effectRef: 'effect', constantRef: 'constant', tableRef: 'table' };

export const lookupColumnsIn = (source: string): [string, string][] => {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return []; }
  const out: [string, string][] = [];
  const walk = (node: Node): void => {
    if (node.kind === 'Call') {
      const [first, , third] = node.args;
      if (node.name === 'таблица' && first?.kind === 'Text' && third?.kind === 'Text') out.push([first.value, third.value]);
      node.args.forEach(walk);
    } else if (node.kind === 'Unary') walk(node.operand);
    else if (node.kind === 'Binary') { walk(node.left); walk(node.right); }
    else if (node.kind === 'Conditional') { walk(node.test); walk(node.then); walk(node.otherwise); }
  };
  walk(ast);
  return out;
};

export const tablesIn = (source: string): string[] => {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return []; }
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.kind === 'Call') {
      const first = node.args[0];
      if (node.name === 'таблица' && first?.kind === 'Text' && !out.includes(first.value)) out.push(first.value);
      node.args.forEach(walk);
    } else if (node.kind === 'Unary') walk(node.operand);
    else if (node.kind === 'Binary') { walk(node.left); walk(node.right); }
    else if (node.kind === 'Conditional') { walk(node.test); walk(node.then); walk(node.otherwise); }
  };
  walk(ast);
  return out;
};

function picksIn(source: string): { tag: string; rest?: string }[] {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return []; }
  const out: { tag: string; rest?: string }[] = [];
  const walk = (node: Node): void => {
    if (node.kind === 'Pick') {
      out.push({ tag: node.tag, ...(node.rest ? { rest: node.rest } : {}) });
      walk(node.key);
    } else if (node.kind === 'Call') node.args.forEach(walk);
    else if (node.kind === 'Unary') walk(node.operand);
    else if (node.kind === 'Binary') { walk(node.left); walk(node.right); }
    else if (node.kind === 'Conditional') { walk(node.test); walk(node.then); walk(node.otherwise); }
  };
  walk(ast);
  return out;
}

const ARITHMETIC = new Set(['+', '-', '*', '/', '<', '<=', '>', '>=']);

export const diceAsNumber = (source: string): boolean => {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return false; }
  const dice = (node: Node): boolean => node.kind === 'Text' && node.dice === true;
  const walk = (node: Node): boolean => {
    if (node.kind === 'Unary') return dice(node.operand) || walk(node.operand);
    if (node.kind === 'Binary') return (ARITHMETIC.has(node.op) && (dice(node.left) || dice(node.right))) || walk(node.left) || walk(node.right);
    if (node.kind === 'Call') return node.args.some(walk);
    if (node.kind === 'Conditional') return walk(node.test) || walk(node.then) || walk(node.otherwise);
    if (node.kind === 'Pick') return walk(node.key);
    return false;
  };
  return walk(ast);
};

const KNOWN_FUNCTIONS = new Set([...FUNCTION_NAMES, 'если']);

export const unknownFunctions = (source: string): string[] => {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return []; }
  const out = new Set<string>();
  const walk = (node: Node): void => {
    if (node.kind === 'Call') { if (!KNOWN_FUNCTIONS.has(node.name)) out.add(node.name); node.args.forEach(walk); }
    else if (node.kind === 'Unary') walk(node.operand);
    else if (node.kind === 'Binary') { walk(node.left); walk(node.right); }
    else if (node.kind === 'Conditional') { walk(node.test); walk(node.then); walk(node.otherwise); }
    else if (node.kind === 'Pick') walk(node.key);
  };
  walk(ast);
  return [...out];
};

export function exprRefs(source: string, from: Where, scope: ChainScope, out: Reference[]): void {
  const text = source.trim();
  if (!text) return;
  const deps = formulaDeps(text);
  if (!deps) {
    out.push({ kind: 'syntax', key: text, from });
    return;
  }
  if (diceAsNumber(text)) out.push({ kind: 'syntax', key: text, from, path: 'dice' });
  for (const name of unknownFunctions(text)) out.push({ kind: 'syntax', key: text, from, path: 'function', scope: name });
  for (const table of tablesIn(text)) out.push({ kind: 'table', key: table, from });
  for (const [table, column] of lookupColumnsIn(text)) out.push({ kind: 'table', key: table, from, scope: 'column', path: column });
  const picked = new Set<string>();
  for (const pick of picksIn(text)) {
    const dot = pick.tag.indexOf('.');
    const top = dot > 0 ? pick.tag.slice(0, dot) : pick.tag;
    const rest = dot > 0 ? pick.tag.slice(dot + 1) : '';
    if (!rest || rest.includes('.') || !(scope.sheets.has(top) || top === DESK_NAME)) continue;
    picked.add(pick.tag);
    out.push({ kind: 'table', key: rest, from });
    const column = pick.rest?.split('.')[0];
    if (column) out.push({ kind: 'table', key: rest, from, scope: 'cell', path: column });
  }
  const cell = (row: string, column: string | undefined): void => {
    const table = scope.rows?.get(row);
    if (table && column) out.push({ kind: 'table', key: table, from, scope: 'cell', path: column });
  };
  for (const dep of deps) {
    if (picked.has(dep)) continue;
    const dotAt = dep.indexOf('.');
    const top = dotAt > 0 ? dep.slice(0, dotAt) : dep;
    const rest = dotAt > 0 ? dep.slice(dotAt + 1) : '';
    if (top === ITEM_NAME) {
      if (rest) out.push({ kind: 'prop', key: rest.split('.')[0]!, from, scope: 'item' });
      continue;
    }
    if (scope.sheets.has(top) || top === DESK_NAME) {
      if (!rest) continue;
      const parts = rest.split('.');
      if (scope.params.has(parts[0]!)) {
        cell(parts[0]!, parts[1]);
        continue;
      }
      const near = parts.length > 1 && scope.rows?.size ? [...scope.rows.keys()] : [];
      out.push({ kind: 'field', key: parts[0]!, from, scope: top === DESK_NAME ? 'desk' : 'sheet', ...(parts.length > 1 ? { path: rest } : {}), ...(near.length ? { near } : {}) });
      continue;
    }
    if (scope.earlier.has(dep) || scope.params.has(dep)) continue;
    if (scope.later?.has(dep)) {
      out.push({ kind: 'step', key: dep, from, scope: 'chain' });
      continue;
    }

    const dot = dep.indexOf('.');
    if (dot > 0) {
      const head = dep.slice(0, dot);
      if (scope.params.has(head)) {
        cell(head, dep.slice(dot + 1).split('.')[0]);
        continue;
      }
      if (scope.earlier.has(head)) continue;
      out.push({ kind: 'step', key: head, from, scope: 'dotted', path: dep });
      continue;
    }
    out.push({ kind: 'field', key: dep, from, scope: scope.bare ? 'bare' : 'plain' });
  }
}

function guardRefs(guard: Guard | undefined, from: Where, scope: ChainScope, out: Reference[]): void {
  if (guard) exprRefs(guard.expr, from, scope, out);
}

export function chainRefs(
  steps: Step[], whereOf: (index: number) => Where, params: Set<string>, sheets: Iterable<string>, seeds: string[] = [],
  defs: readonly Param[] = [],
): Reference[] {
  const out: Reference[] = [];
  const earlier = new Set<string>(seeds);
  const named = new Set(sheets);
  const rows = new Set<string>();
  const tables = new Map((defs ?? []).filter(param => param.kind === 'choice' && typeof param.from === 'string' && !param.many).map(param => [param.key, String(param.from)] as const));
  const ids = steps.map(step => step.id).filter((id): id is string => Boolean(id));
  const arms = armsOf(steps);
  steps.forEach((step, index) => {
    const from = whereOf(index);
    const visible = new Set([...seeds, ...steps.slice(0, index).flatMap((other, at) => (other.id && sees(arms, at, index) ? [String(other.id)] : []))]);
    const later = new Set(ids.filter(id => !visible.has(id)));
    const scope: ChainScope = { params: rows.size ? new Set([...params, ...rows]) : params, earlier: visible, sheets: new Set(named), bare: true, later, rows: tables };
    const mod = registry.get(step.type);
    for (const slot of (mod?.slots ?? []) as { key: string; kind?: string; refersTo?: string }[]) {
      if (slot.key === 'if') continue;
      const kind = slot.refersTo ? `${slot.refersTo}Ref` : slot.kind;
      slotRefs(readPath(step, slot.key), kind, from, scope, out);
    }
    guardRefs(step.if, from, scope, out);
    if (step.id) earlier.add(String(step.id));
    const loop = step.type === 'each' ? loopOf(defs, step as { of?: unknown })?.key : undefined;
    if (loop) named.add(loop);
    const row = loopParam(step as never);
    if (row) {
      rows.add(row.key);
      if (row.from) tables.set(row.key, row.from);
    }
  });
  for (const ref of out) if (ref.kind === 'param' && !params.has(ref.key)) ref.scope = 'missing';
  return out;
}

const ROW_PATH = /@строка((?:\.[\p{L}\p{N}_]+)*)/gu;

function rowFree(text: string, from: Where, own: Set<string> | undefined, out: Reference[]): string {
  if (!own) return text;
  return text.replace(ROW_PATH, (_, tail: string) => {
    const head = tail.slice(1).split('.')[0] ?? '';
    if (!own.has(head)) out.push({ kind: 'prop', key: head || 'строка', from, scope: 'foreign' });
    return '0';
  });
}

export interface CallNames { sheets: string[]; values: string[] }

export function callNamesOf(system: System, key: string): CallNames {
  if (key === ROLL_CALL) return { sheets: ['бросающий', 'против'], values: ['метки'] };
  const effect = system.effects?.[key];
  const params = effect?.params ?? [];
  return {
    sheets: params.filter(p => p.kind === 'sheet').map(p => p.key),
    values: [...params.filter(p => p.kind !== 'sheet').map(p => p.key), 'метки'],
  };
}

export function holderNameOf(system: System, call: string): string | null {
  if (call === ROLL_CALL) return callNamesOf(system, call).sheets[0] ?? null;
  const sheets = (system.effects?.[call]?.params ?? []).filter(p => p.kind === 'sheet' && !p.many);
  return (sheets.find(p => p.role === 'target') ?? sheets[0])?.key ?? null;
}

export function holderConditionOf(system: System, call: string): string | null {
  const name = holderNameOf(system, call);
  return name ? `@${name} == @${HOLDER}` : null;
}

export function tiedToHolder(condition: Guard | undefined): boolean {
  const text = String(condition?.expr ?? '').trim();
  if (!text) return false;
  let ast: Node;
  try {
    ast = compile(text).ast;
  } catch {
    return true;
  }
  const isHolder = (node: Node): boolean => node.kind === 'Ref' && node.tag === HOLDER;
  const visit = (node: Node): boolean => {
    if (node.kind === 'Binary') return ((node.op === '==' || node.op === '!=') && (isHolder(node.left) || isHolder(node.right))) || visit(node.left) || visit(node.right);
    if (node.kind === 'Unary') return visit(node.operand);
    if (node.kind === 'Call') return node.args.some(visit);
    if (node.kind === 'Conditional') return visit(node.test) || visit(node.then) || visit(node.otherwise);
    if (node.kind === 'Pick') return visit(node.key);
    return false;
  };
  return visit(ast);
}

function modifierRefs(system: System, list: Modifier[] | undefined, from: Where, out: Reference[], own?: Set<string>, inputs: Param[] = []): void {
  for (const mod of list ?? []) {
    const target = String((mod as { target?: string }).target ?? '');
    if (mod.kind === 'edit') {
      if (mod.call === ROLL_CALL) {
        for (const tag of [...mod.tags ?? [], ...mod.anyTags ?? [], ...mod.notTags ?? []]) out.push({ kind: 'roll', key: tag, from });
        if (mod.edit) out.push({ kind: 'rollEdit', key: String(mod.edit), from });
      } else {
        out.push({ kind: 'effect', key: mod.call, from });
        for (const tag of [...mod.tags ?? [], ...mod.anyTags ?? [], ...mod.notTags ?? []]) out.push({ kind: 'tag', key: tag, from });
      }
      const names = callNamesOf(system, mod.call);
      const scope = sheetScope(
        new Set([...names.values, ...inputs.filter(p => p.kind !== 'sheet').map(p => p.key)]),
        [...names.sheets, ...inputs.filter(p => p.kind === 'sheet').map(p => p.key), HOLDER],
      );
      if (mod.if?.expr.trim()) exprRefs(rowFree(mod.if.expr, from, own, out), from, scope, out);
      if (mod.value?.expr.trim()) exprRefs(rowFree(mod.value.expr, from, own, out), from, scope, out);
    } else {
      if (target.includes('{@строка.')) {
        for (const slot of target.matchAll(/\{@строка\.([\p{L}\p{N}_]+)\}/gu)) if (own && !own.has(slot[1]!)) out.push({ kind: 'prop', key: slot[1]!, from, scope: 'foreign' });
      } else if (target && !target.includes(':') && target !== '*') out.push({ kind: 'field', key: target, from });
      const condition = (mod as { if?: { expr: string } }).if;
      const valueScope = inputs.length ? { ...plainScope(), params: new Set(inputs.filter(p => p.kind !== 'sheet').map(p => p.key)) } : plainScope();
      if (condition?.expr.trim()) exprRefs(rowFree(condition.expr, from, own, out), from, valueScope, out);
      if (mod.value?.expr.trim()) exprRefs(rowFree(mod.value.expr, from, own, out), from, valueScope, out);
    }
    const where = (mod as { where?: { table?: unknown } }).where;
    if (where && typeof where.table === 'string' && where.table) out.push({ kind: 'table', key: where.table, from, scope: 'condition' });
  }
}

export const TARGETS_SEED = 'итоги';

export type Listener =
  | { kind: 'call'; phase: Phase; key: string }
  | { kind: 'seen' | 'rolled' | 'empty' }
  | { kind: 'moment' | 'field' | 'gained' | 'lost' | 'unknown'; key: string };

export function listenerOf({ on }: { on?: string }): Listener {
  if (!on) return { kind: 'empty' };
  if (on === SEEN) return { kind: 'seen' };
  if (on === ROLLED) return { kind: 'rolled' };
  const call = callHappening(on);
  if (call) return { kind: 'call', phase: call.phase, key: call.of };
  if (on.startsWith(MOMENT_PREFIX)) return { kind: 'moment', key: on.slice(MOMENT_PREFIX.length) };
  if (on.startsWith(FIELD_PREFIX)) return { kind: 'field', key: on.slice(FIELD_PREFIX.length) };
  if (on.startsWith(GAINED_PREFIX)) return { kind: 'gained', key: on.slice(GAINED_PREFIX.length) };
  if (on.startsWith(LOST_PREFIX)) return { kind: 'lost', key: on.slice(LOST_PREFIX.length) };
  return { kind: 'unknown', key: on };
}

export interface HeardNames { sheets: string[]; seeds: string[]; listened: Effect | null }

export function sourcesOf(system: System, key: string): Effect[] {
  const direct = system.effects?.[key];
  return direct ? [direct] : Object.values(system.effects ?? {}).filter(effect => (effect.tags ?? []).includes(key));
}

export function heardNames(system: System, listener: Listener): HeardNames {
  if (listener.kind === 'seen' || listener.kind === 'rolled') return { sheets: ['бросающий', 'против'], seeds: ['roll'], listened: null };
  if (listener.kind === 'moment') return { sheets: TURN_MOMENTS.has(listener.key) ? ['ходит'] : [], seeds: ['moment'], listened: null };
  if (listener.kind === 'gained' || listener.kind === 'lost') return { sheets: ['лист'], seeds: ['about'], listened: null };
  if (listener.kind === 'field') return { sheets: ['лист'], seeds: ['field'], listened: null };
  if (listener.kind !== 'call') return { sheets: [], seeds: [], listened: null };
  if (listener.key === ANY_ACTION) return { sheets: [], seeds: [], listened: null };
  const contracts = contractsOf(system, listener.key);
  if (contracts.length) {
    const inputs = contracts.flatMap(contract => contract.inputs ?? []);
    const done = listener.phase === 'done';
    return {
      sheets: [...inputs.filter(i => i.kind === 'sheet').map(i => i.key), ...(done ? [] : contracts.flatMap(contract => (contract.each ? [contract.each] : [])))],
      seeds: [...inputs.filter(i => i.kind !== 'sheet').map(i => i.key), ...(done ? [] : contracts.flatMap(contract => contract.outputs ?? [])), CALL_TAGS, ...(done ? [TARGETS_SEED] : [])],
      listened: null,
    };
  }
  const effect = system.effects?.[listener.key] ?? null;
  const params = effect?.params ?? [];
  const steps = effect?.steps ?? [];
  const split = steps.findIndex(step => step.type === 'each' && splitsTargets(step as never));
  const loop = split >= 0 ? loopOf(params, steps[split] as { of?: unknown })?.key : undefined;
  const rowAt = steps.findIndex(step => loopParam(step as never));
  const cuts = [listener.phase === 'done' ? split : -1, rowAt].filter(at => at >= 0);
  const visible = cuts.length ? steps.slice(0, Math.min(...cuts)) : steps;
  return {
    sheets: [...params.filter(p => p.kind === 'sheet').map(p => p.key), ...(loop && listener.phase !== 'done' ? [loop] : [])],
    seeds: [
      ...params.filter(p => p.kind !== 'sheet').map(p => p.key),
      ...visible.map(step => step.id).filter((id): id is string => Boolean(id)),
      ...(listener.phase === 'after' ? (effect?.returns ?? []).map(column => column.key) : []),
      CALL_TAGS,
      ...(listener.phase === 'done' ? [TARGETS_SEED] : []),
    ],
    listened: effect,
  };
}

export function contractsOf(system: System, tag: string): NonNullable<System['tags']>[string][] {
  const out: NonNullable<System['tags']>[string][] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const contract = system.tags?.[key];
    if (!contract) return;
    out.push(contract);
    for (const included of contract.includes ?? []) visit(included);
  };
  visit(tag);
  return out;
}

function typedRefs(spec: { kind?: string; from?: string }, from: Where, out: Reference[]): void {
  if (!spec.from) return;
  if (spec.kind === 'choice' || spec.kind === 'number') out.push({ kind: 'table', key: spec.from, from });
  if (spec.kind === 'record') out.push({ kind: 'recordKind', key: spec.from, from });
}

function effectRefs(system: System, id: string, effect: Effect, out: Reference[]): void {
  const sheetKeys = (effect.params ?? []).filter(p => p.kind === 'sheet').map(p => p.key);
  const params = new Set((effect.params ?? []).filter(p => p.kind !== 'sheet').map(p => p.key));
  for (const param of effect.params ?? []) {
    typedRefs(param, { tab: 'effects', effect: id, part: 'params', key: param.key }, out);
    if (param.kind === 'effect' && typeof param.default === 'string' && param.default) out.push({ kind: 'effect', key: param.default, from: { tab: 'effects', effect: id, part: 'params', key: param.key } });
  }
  out.push(...chainRefs(effect.steps ?? [], step => ({ tab: 'effects', effect: id, step }), params, sheetKeys, [CALL_TAGS], effect.params ?? []));
  out.push(...chainRefs(effect.cost ?? [], step => ({ tab: 'effects', effect: id, step, part: 'cost' }), params, sheetKeys, [CALL_TAGS]));
  (effect.on ?? []).forEach((handler, index) => {
    const head: Where = { tab: 'effects', effect: id, part: 'on', handler: index };
    const heard = listenerOf(handler);
    const names = heardNames(system, heard);
    const sheets = [...names.sheets, ...sheetKeys, HOLDER];
    const weak = heard.kind === 'call' && heard.key !== ANY_ACTION && !system.effects?.[heard.key] && !system.tags?.[heard.key];
    const soften = (refs: Reference[]): Reference[] => (weak
      ? refs.map(ref => (ref.kind === 'step' || (ref.kind === 'field' && ref.scope === 'bare') ? { ...ref, scope: LISTEN } : ref))
      : refs);
    out.push(...soften(chainRefs(handler.steps ?? [], step => ({ tab: 'effects', effect: id, handler: index, step }), params, sheets, names.seeds)));
    out.push(...soften(chainRefs(handler.cost ?? [], step => ({ tab: 'effects', effect: id, handler: index, step, part: 'cost' }), params, sheets, names.seeds)));
    if (heard.kind === 'call' && heard.key !== ANY_ACTION && !system.tags?.[heard.key]) {
      out.push({ kind: 'effect', key: heard.key, from: head, scope: LISTEN });
    }
    if (heard.kind === 'gained' || heard.kind === 'lost') out.push({ kind: 'effect', key: heard.key, from: head });
    if (heard.kind === 'field') out.push({ kind: 'field', key: heard.key, from: head });
    if (handler.if) {
      const found: Reference[] = [];
      exprRefs(handler.if.expr, head, sheetScope(params, sheets, names.seeds), found);
      for (const ref of soften(found)) {
        if (ref.scope === LISTEN) {
          out.push(ref);
          continue;
        }
        if (ref.kind === 'step' && names.listened) {
          out.push({ ...ref, scope: `listened:${heard.kind === 'call' ? heard.key : ''}` });
          continue;
        }
        out.push(ref);
      }
    }
  });
  for (const turn of ['attach', 'detach'] as const) {
    out.push(...chainRefs(effect[turn] ?? [], step => ({ tab: 'effects', effect: id, step, part: turn }), params, [...sheetKeys, HOLDER]));
  }
  const stepIds = [...(effect.steps ?? []), ...(effect.cost ?? [])].map(step => step.id).filter((one): one is string => Boolean(one));
  const bondIf = (effect.bond as { if?: { expr?: unknown } } | undefined)?.if?.expr;
  if (typeof bondIf === 'string') exprRefs(bondIf, { tab: 'effects', effect: id, part: 'bond' }, sheetScope(params, sheetKeys, []), out);
  for (const column of effect.returns ?? []) {
    const expr = (column.expr as { expr?: unknown } | undefined)?.expr;
    if (typeof expr === 'string') exprRefs(expr, { tab: 'effects', effect: id, part: 'returns', key: column.key }, sheetScope(params, sheetKeys, stepIds), out);
  }
  modifierRefs(system, effect.modifiers, { tab: 'effects', effect: id, part: 'modifiers' }, out, undefined, effect.params ?? []);
  for (const key of effect.grants ?? []) out.push({ kind: 'effect', key, from: { tab: 'effects', effect: id, part: 'grants' } });
}

export function withAddresses(system: System, refs: Reference[]): Reference[] {
  const fields = new Set(fieldsOf(system).map(f => f.tag));
  const tables: Reference[] = [];
  for (const ref of refs) {
    if (!ref.path || ref.scope === 'column' || ref.scope === 'cell') continue;
    const head = ref.path.split('.')[0]!;
    if (fields.has(head) || !system.tables?.[head]) continue;
    ref.kind = 'field';
    ref.key = ref.path;
    if (ref.scope === 'dotted') ref.scope = 'address';
    tables.push({ kind: 'table', key: head, from: ref.from });
  }
  return tables.length ? [...refs, ...tables] : refs;
}

export function referencesOf(system: System, compendium?: Compendium): Reference[] {
  const out: Reference[] = [];
  const noScope = plainScope();

  for (const field of fieldsOf(system)) {
    const from: Where = { tab: 'sheet', field: field.tag };
    for (const tag of field.roll?.tags ?? []) out.push({ kind: 'roll', key: tag, from });
    if (field.roll?.die) out.push({ kind: 'constant', key: field.roll.die, from });
    if (field.value.kind === 'formula') exprRefs(field.value.expr, from, noScope, out);
    if (field.value.kind === 'stored' && field.value.type === 'choice') out.push({ kind: 'table', key: field.value.from ?? '', from });
    else {
      const link = fieldLinkOf(system, field);
      if (link) out.push({ kind: 'table', key: link, from });
    }
    if (field.lives === 'desk') {
      for (const ref of out) if (ref.from === from && ref.scope === 'plain') delete ref.scope;
    }
  }

  for (const [id, table] of Object.entries(system.tables ?? {})) {
    const from: Where = { tab: 'rules', section: 'tables', key: id };
    for (const column of table.columns ?? []) {
      if (column.kind !== 'table') continue;
      for (const row of table.rows ?? []) {
        const cell = (row.cells ?? {})[column.key];
        if (typeof cell === 'string' && cell) out.push({ kind: 'table', key: cell, from });
      }
    }
  }

  for (const [id, effect] of Object.entries(system.effects ?? {})) effectRefs(system, id, effect, out);

  const allProps = new Set(kindsOf(system).flatMap(([, spec]) => (spec.columns ?? []).map(p => p.key)));
  const flat = flattenSystem(system, true);
  const columnsOf = (kind: string | undefined): readonly { key: string }[] =>
    (kind ? (flat.tables?.[kind]?.columns ?? system.tables?.[kind]?.columns) : undefined) ?? [];
  for (const [kind, spec] of kindsOf(system)) {
    const own = new Set([...(spec.columns ?? []), ...columnsOf(kind)].map(p => p.key));
    for (const prop of spec.columns ?? []) typedRefs(prop, { tab: 'records', kind, part: 'props', key: prop.key }, out);
    (spec.bindings ?? []).forEach((binding, index) => {
      const from: Where = { tab: 'records', kind, part: 'bindings', binding: index };
      if (binding.effect) out.push({ kind: 'effect', key: binding.effect, from });
      const bound = system.effects?.[binding.effect]?.params ?? [];
      const called = system.effects?.[binding.effect];
      const payments = called ? paymentsOf(system, called, (binding.args ?? {}) as Record<string, unknown>) : [];
      for (const { id: paid } of payments) out.push({ kind: 'effect', key: paid, from });
      const asked = payments.flatMap(({ payment }) => (payment.params ?? []).filter(p => p.ask).map(p => p.key));
      const argScope = sheetScope(new Set([...bound.filter(p => p.kind !== 'sheet').map(p => p.key), ...own, ...asked]), [...bound.filter(p => p.kind === 'sheet').map(p => p.key), HOLDER]);
      const paramNames = new Set(bound.map(p => p.key));
      for (const arg of Object.values(binding.args ?? {})) {
        const expr = arg && typeof arg === 'object' && 'expr' in arg ? String((arg as { expr: unknown }).expr) : '';
        let deps: readonly string[] = [];
        try { deps = expr ? compile(expr).deps : []; } catch { deps = []; }
        const foreign = deps.map(dep => dep.split('.')[0]!).filter(head => !own.has(head) && !paramNames.has(head) && head !== HOLDER && allProps.has(head));
        for (const key of new Set(foreign)) out.push({ kind: 'prop', key, from, scope: 'foreign' });
        if (!foreign.length) slotRefs(arg, undefined, from, argScope, out);
      }
    });
    modifierRefs(system, spec.modifiers, { tab: 'records', kind, part: 'modifiers' }, out, spec.shape === 'book' ? own : undefined);
    for (const id of spec.grants ?? []) out.push({ kind: 'effect', key: id, from: { tab: 'records', kind, part: 'grants' } });
  }


  for (const id of system.grants ?? []) out.push({ kind: 'effect', key: id, from: { tab: 'rules', section: 'grants', key: id } });

  for (const [key, edit] of Object.entries(system.roll_edits ?? {})) {
    const from: Where = { tab: 'rules', section: 'roll_edits', key };
    for (const op of edit.ops ?? []) {
      for (const value of Object.values(op)) {
        if (value && typeof value === 'object' && 'expr' in value) exprRefs(String((value as { expr: unknown }).expr), from, noScope, out);
      }
    }
  }

  if (system.initiative) {
    const from: Where = { tab: 'rules', section: 'initiative' };
    if (system.initiative.die) out.push({ kind: 'constant', key: system.initiative.die, from });
    if (system.initiative.bonus) slotRefs(system.initiative.bonus, undefined, from, noScope, out);
    for (const tag of system.initiative.tags ?? []) out.push({ kind: 'roll', key: tag, from });
    for (const tag of system.initiative.ties ?? []) out.push({ kind: 'field', key: tag, from });
  }

  const records = new Map([...(system.library ?? []), ...recordsOf(compendium)].map(record => [record.id, record]));
  for (const list of [[...records.values()]]) {
    for (const record of list) {
      const from: Where = { tab: 'book', record: record.id };
      if (record.table) out.push({ kind: 'recordKind', key: String(record.table), from });
      for (const id of record.grants ?? []) out.push({ kind: 'effect', key: id, from });
      for (const binding of record.bindings ?? []) if (binding.effect) out.push({ kind: 'effect', key: binding.effect, from });
      const columns = columnsOf(record.table) as NonNullable<Table['columns']>;
      const props = new Set(columns.map(c => c.key));
      for (const column of columns) {
        const cell = (record.cells ?? {})[column.key];
        if (!isFormulaCell(cell)) continue;
        exprRefs(cell.expr, { ...from, key: column.key }, sheetScope(props, [HOLDER]), out);
      }
      modifierRefs(system, record.modifiers, from, out, record.table ? new Set(columnsOf(record.table).map(c => c.key)) : undefined);
    }
  }

  return withAddresses(system, out);
}
