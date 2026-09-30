import { tagWords } from '../engine/roll-tags.ts';
import { ANY_ROLL, incomingTagOf } from '../engine/targets.ts';
import { ownerOf } from '../engine/owners.ts';
import type { System, Compendium, Effect, Step, Modifier, Guard } from './types.ts';
import { compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { registry } from '../engine/steps/index.ts';
import { calledOf } from '../engine/effects.ts';
import { recordsOf, recordKinds, kindsOf } from './owned.ts';

export { EVENT_PREFIX, MOMENT_PREFIX, FIELD_PREFIX } from '../events/bus.ts';
import { EVENT_PREFIX, MOMENT_PREFIX, FIELD_PREFIX, GAINED_PREFIX, LOST_PREFIX } from '../events/bus.ts';
import { fieldsOf, hasField } from './sheet-columns.ts';

export const EVENT_RESULTS = ['event', 'event_amount', 'event_incoming'] as const;

export const SEED_RESULTS = ['worn', 'moment', 'field'] as const;

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
  | 'field' | 'effect' | 'constant' | 'table' | 'rollEdit' | 'event' | 'roll'
  | 'param' | 'step' | 'prop' | 'recordKind';

export interface Reference {
  kind: RefKind;
  key: string;
  from: Where;
  scope?: string;
  path?: string;
}

export interface Declared {
  field: Set<string>;
  effect: Set<string>;
  constant: Set<string>;
  table: Set<string>;
  rollEdit: Set<string>;
  event: Set<string>;
  roll: Set<string>;
  prop: Set<string>;
  recordKind: Set<string>;
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
    prop: new Set(recordKinds(system).flatMap(([, k]) => (k.columns ?? []).map(p => p.key))),
    recordKind: new Set(kindsOf(system).map(([id]) => id)),
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
  eventChain: boolean;
  later?: Set<string>;
}

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
  if (typeof value !== 'object') return;
  const r = value as Record<string, unknown>;
  if ('tag' in r) {
    if (r.tag) out.push({ kind: 'field', key: String(r.tag), from });
    return;
  }
  if ('constant' in r) {
    if (r.constant) out.push({ kind: 'constant', key: String(r.constant), from });
    return;
  }
  if ('param' in r) {
    out.push({ kind: 'param', key: String(r.param), from, scope: 'chain' });
    return;
  }
  if ('prop' in r) {
    if (r.prop) out.push({ kind: 'prop', key: String(r.prop), from });
    return;
  }
  if ('expr' in r) {
    exprRefs(String(r.expr ?? ''), from, scope, out);
    return;
  }
  if ('const' in r && slotKind === 'effectRef') {
    if (typeof r.const === 'string' && r.const) out.push({ kind: 'effect', key: r.const, from });
  }
}

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

export function exprRefs(source: string, from: Where, scope: ChainScope, out: Reference[]): void {
  const text = source.trim();
  if (!text) return;
  const deps = formulaDeps(text);
  if (!deps) return;
  for (const table of tablesIn(text)) out.push({ kind: 'table', key: table, from });
  for (const dep of deps) {
    const owned = ownerOf(dep);
    if (owned) {
      const parts = owned.rest.split('.');
      const head = parts[0]!;
      if (owned.rest.includes('.') && scope.params.has(head)) continue;
      out.push({ kind: 'field', key: head, from, scope: `owner:${owned.owner}`, ...(parts.length > 1 ? { path: owned.rest } : {}) });
      continue;
    }
    if (scope.earlier.has(dep) || scope.params.has(dep)) continue;
    if (scope.eventChain && (EVENT_RESULTS as readonly string[]).includes(dep)) continue;
    if (scope.later?.has(dep)) {
      out.push({ kind: 'step', key: dep, from, scope: 'chain' });
      continue;
    }

    const dot = dep.indexOf('.');
    if (dot > 0) {
      const head = dep.slice(0, dot);
      if (scope.earlier.has(head) || scope.params.has(head)) continue;
      if ((SEED_RESULTS as readonly string[]).includes(head)) continue;
      if (scope.eventChain && (EVENT_RESULTS as readonly string[]).includes(head)) continue;
      out.push({ kind: 'step', key: head, from, scope: 'dotted', path: dep });
      continue;
    }
    out.push({ kind: 'field', key: dep, from, scope: 'plain' });
  }
}

function guardRefs(guard: Guard | undefined, from: Where, scope: ChainScope, out: Reference[]): void {
  if (guard) exprRefs(guard.expr, from, scope, out);
}

export function chainRefs(steps: Step[], whereOf: (index: number) => Where, params: Set<string>, eventChain: boolean): Reference[] {
  const out: Reference[] = [];
  const earlier = new Set<string>();
  const ids = steps.map(step => step.id).filter((id): id is string => Boolean(id));
  steps.forEach((step, index) => {
    const from = whereOf(index);
    const later = new Set(ids.filter(id => !earlier.has(id)));
    const scope: ChainScope = { params, earlier: new Set(earlier), eventChain, later };
    const mod = registry.get(step.type);
    for (const slot of (mod?.slots ?? []) as { key: string; kind?: string; refersTo?: string }[]) {
      const kind = slot.refersTo === 'effect' ? 'effectRef' : slot.kind;
      slotRefs(readPath(step, slot.key), kind, from, scope, out);
    }
    guardRefs(step.when, from, scope, out);
    if (step.id) earlier.add(String(step.id));
  });
  for (const ref of out) if (ref.kind === 'param' && !params.has(ref.key)) ref.scope = 'missing';
  return out;
}

function modifierRefs(list: Modifier[] | undefined, from: Where, out: Reference[]): void {
  for (const mod of list ?? []) {
    const target = String(mod.target ?? '');
    if (mod.kind === 'value') {
      if (target && !target.includes(':') && target !== '*') out.push({ kind: 'field', key: target, from });
    } else {
      if (target && target !== ANY_ROLL && target !== incomingTagOf(ANY_ROLL)) out.push({ kind: 'roll', key: target, from });
      for (const tag of (mod as { tags?: string[] }).tags ?? []) out.push({ kind: 'roll', key: tag, from });
      if (mod.edit) out.push({ kind: 'rollEdit', key: String(mod.edit), from });
    }
    const noScope = { params: new Set<string>(), earlier: new Set<string>(), eventChain: false };
    if (mod.condition?.expr.trim()) exprRefs(mod.condition.expr, from, noScope, out);
    if (mod.value?.expr.trim()) exprRefs(mod.value.expr, from, noScope, out);
    const where = (mod as { where?: { table?: unknown } }).where;
    if (where && typeof where.table === 'string' && where.table) out.push({ kind: 'table', key: where.table, from, scope: 'condition' });
  }
}

export function listenerOf(
  on: string | undefined,
): { kind: 'any' | 'event' | 'effect' | 'moment' | 'field' | 'gained' | 'lost' | 'empty'; key?: string } {
  if (!on) return { kind: 'empty' };
  if (on === '*') return { kind: 'any' };
  if (on.startsWith(EVENT_PREFIX)) return { kind: 'event', key: on.slice(EVENT_PREFIX.length) };
  if (on.startsWith(MOMENT_PREFIX)) return { kind: 'moment', key: on.slice(MOMENT_PREFIX.length) };
  if (on.startsWith(FIELD_PREFIX)) return { kind: 'field', key: on.slice(FIELD_PREFIX.length) };
  if (on.startsWith(GAINED_PREFIX)) return { kind: 'gained', key: on.slice(GAINED_PREFIX.length) };
  if (on.startsWith(LOST_PREFIX)) return { kind: 'lost', key: on.slice(LOST_PREFIX.length) };
  return { kind: 'effect', key: on };
}

function typedRefs(spec: { kind?: string; from?: string }, from: Where, out: Reference[]): void {
  if (!spec.from) return;
  if (spec.kind === 'choice') out.push({ kind: 'table', key: spec.from, from });
  if (spec.kind === 'record') out.push({ kind: 'recordKind', key: spec.from, from });
}

function effectRefs(system: System, id: string, effect: Effect, out: Reference[]): void {
  const params = new Set((effect.params ?? []).map(p => p.key));
  for (const param of effect.params ?? []) typedRefs(param, { tab: 'effects', effect: id, part: 'params', key: param.key }, out);
  const called = calledOf(system).some(([key]) => key === id);
  out.push(...chainRefs(effect.steps ?? [], step => ({ tab: 'effects', effect: id, step }), params, called));
  out.push(...chainRefs(effect.self ?? [], step => ({ tab: 'effects', effect: id, step, part: 'self' }), params, false));
  (effect.on ?? []).forEach((handler, index) => {
    const head: Where = { tab: 'effects', effect: id, part: 'on', handler: index };
    const heard = listenerOf(handler.on);
    out.push(...chainRefs(handler.steps ?? [], step => ({ tab: 'effects', effect: id, handler: index, step }), params, heard.kind === 'event'));
    out.push(...chainRefs(handler.self ?? [], step => ({ tab: 'effects', effect: id, handler: index, step, part: 'self' }), params, false));
    if (heard.kind === 'event') out.push({ kind: 'event', key: heard.key!, from: head });
    if (heard.kind === 'effect') out.push({ kind: 'effect', key: heard.key!, from: head, scope: LISTEN });
    if (heard.kind === 'gained' || heard.kind === 'lost') out.push({ kind: 'effect', key: heard.key!, from: head });
    if (heard.kind === 'field') out.push({ kind: 'field', key: heard.key!, from: head });
    if (handler.if) {
      const found: Reference[] = [];
      exprRefs(handler.if.expr, head, { params, earlier: new Set(), eventChain: heard.kind === 'event' }, found);
      const listened = heard.kind === 'effect' ? system.effects[heard.key!] : undefined;
      const listenedSteps = new Set((listened?.steps ?? []).map(s => s.id).filter(Boolean));
      const absent = heard.kind === 'effect' && !listened;
      for (const ref of found) {
        if (ref.kind === 'field' && listenedSteps.has(ref.key)) continue;
        if (absent && (ref.kind === 'field' || ref.kind === 'step') && !hasField(system, ref.key)) {
          out.push({ ...ref, scope: LISTEN });
          continue;
        }
        if (ref.kind !== 'step') { out.push(ref); continue; }
        if (listened && !(listened.steps ?? []).some(s => s.id === ref.key)) {
          out.push({ ...ref, scope: `listened:${heard.key}` });
        }
      }
    }
    for (const claim of handler.claims ?? []) out.push({ kind: 'rollEdit', key: claim, from: head });
  });
  for (const turn of ['attach', 'detach'] as const) {
    out.push(...chainRefs(effect[turn] ?? [], step => ({ tab: 'effects', effect: id, step, part: turn }), params, false));
  }
  modifierRefs(effect.modifiers, { tab: 'effects', effect: id, part: 'modifiers' }, out);
  for (const key of effect.grants ?? []) out.push({ kind: 'effect', key, from: { tab: 'effects', effect: id, part: 'grants' } });
}

export function withAddresses(system: System, refs: Reference[]): Reference[] {
  const fields = new Set(fieldsOf(system).map(f => f.tag));
  const tables: Reference[] = [];
  for (const ref of refs) {
    if (!ref.path) continue;
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
  const noScope: ChainScope = { params: new Set(), earlier: new Set(), eventChain: false };

  for (const field of fieldsOf(system)) {
    const from: Where = { tab: 'sheet', field: field.tag };
    for (const tag of field.roll?.tags ?? []) out.push({ kind: 'roll', key: tag, from });
    if (field.roll?.die?.constant) out.push({ kind: 'constant', key: field.roll.die.constant, from });
    if (field.value.kind === 'formula') exprRefs(field.value.expr, from, noScope, out);
    if (field.value.kind === 'stored' && field.value.type === 'choice') out.push({ kind: 'table', key: field.value.from ?? '', from });
    if (field.lives === 'desk') {
      for (const ref of out) if (ref.from === from && ref.scope === 'plain') delete ref.scope;
    }
  }

  for (const [id, effect] of Object.entries(system.effects ?? {})) effectRefs(system, id, effect, out);

  for (const [kind, spec] of kindsOf(system)) {
    const own = new Set((spec.columns ?? []).map(p => p.key));
    for (const prop of spec.columns ?? []) typedRefs(prop, { tab: 'records', kind, part: 'props', key: prop.key }, out);
    (spec.bindings ?? []).forEach((binding, index) => {
      const from: Where = { tab: 'records', kind, part: 'bindings', binding: index };
      if (binding.effect) out.push({ kind: 'effect', key: binding.effect, from });
      for (const arg of Object.values(binding.args ?? {})) {
        if (arg && typeof arg === 'object' && 'prop' in arg) {
          const key = String(arg.prop ?? '');
          if (key) out.push({ kind: 'prop', key, from, scope: own.has(key) ? kind : 'foreign' });
        } else {
          slotRefs(arg, undefined, from, noScope, out);
        }
      }
    });
    modifierRefs(spec.modifiers, { tab: 'records', kind, part: 'modifiers' }, out);
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
    if (system.initiative.die?.constant) out.push({ kind: 'constant', key: system.initiative.die.constant, from });
    if (system.initiative.bonus) slotRefs(system.initiative.bonus, undefined, from, noScope, out);
    for (const tag of system.initiative.tags ?? []) out.push({ kind: 'roll', key: tag, from });
  }

  const records = new Map([...(system.library ?? []), ...recordsOf(compendium)].map(record => [record.id, record]));
  for (const list of [[...records.values()]]) {
    for (const record of list) {
      const from: Where = { tab: 'book', record: record.id };
      if (record.table) out.push({ kind: 'recordKind', key: String(record.table), from });
      for (const id of record.grants ?? []) out.push({ kind: 'effect', key: id, from });
      for (const binding of record.bindings ?? []) if (binding.effect) out.push({ kind: 'effect', key: binding.effect, from });
      modifierRefs(record.modifiers, from, out);
    }
  }

  return withAddresses(system, out);
}
