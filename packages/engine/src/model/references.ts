import type { System, Compendium, Effect, Step, Modifier, Guard } from './types.ts';
import { compile } from '../formula/index.ts';
import { registry } from '../engine/steps/index.ts';

export const EVENT_PREFIX = 'event:';

export const EVENT_RESULTS = ['event', 'event_amount', 'event_incoming'] as const;

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
}

export type RefKind =
  | 'field' | 'effect' | 'constant' | 'table' | 'rollEdit' | 'event' | 'roll'
  | 'actionType' | 'param' | 'step' | 'prop' | 'recordKind';

export interface Reference {
  kind: RefKind;
  key: string;
  from: Where;
  scope?: string;
}

export interface Declared {
  field: Set<string>;
  effect: Set<string>;
  constant: Set<string>;
  table: Set<string>;
  rollEdit: Set<string>;
  event: Set<string>;
  roll: Set<string>;
  actionType: Set<string>;
  prop: Set<string>;
  recordKind: Set<string>;
}

export function declaredOf(system: System): Declared {
  return {
    field: new Set(system.fields.map(f => f.tag)),
    effect: new Set(Object.keys(system.effects ?? {})),
    constant: new Set(Object.keys(system.constants ?? {})),
    table: new Set(Object.keys(system.tables ?? {})),
    rollEdit: new Set(Object.keys(system.roll_edits ?? {})),
    event: new Set(Object.keys(system.events ?? {})),
    roll: new Set((system.rolls ?? []).map(r => r.tag)),
    actionType: new Set(Object.keys(system.action_types ?? {})),
    prop: new Set(Object.values(system.records ?? {}).flatMap(k => (k.props ?? []).map(p => p.key))),
    recordKind: new Set(Object.keys(system.records ?? {})),
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
}

function slotRefs(value: unknown, slotKind: string | undefined, from: Where, scope: ChainScope, out: Reference[]): void {
  if (value === null || value === undefined) return;
  if (slotKind === 'event') {
    if (typeof value === 'string' && value) out.push({ kind: 'event', key: value, from });
    return;
  }
  if (slotKind === 'roll') {
    if (typeof value === 'string' && value) out.push({ kind: 'roll', key: value, from });
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
  if ('prop' in r || 'item' in r) {
    const key = String(r.prop ?? r.item ?? '');
    if (key) out.push({ kind: 'prop', key, from });
    return;
  }
  if ('ref' in r) {
    const head = String(r.ref).split('.')[0] ?? '';
    if (scope.eventChain && (EVENT_RESULTS as readonly string[]).includes(head)) return;
    if (head) out.push({ kind: 'step', key: head, from, scope: 'chain' });
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

function exprRefs(source: string, from: Where, scope: ChainScope, out: Reference[]): void {
  const text = source.trim();
  if (!text) return;
  const deps = formulaDeps(text);
  if (!deps) return;
  for (const dep of deps) {
    if (scope.earlier.has(dep)) continue;
    if (scope.eventChain && (EVENT_RESULTS as readonly string[]).includes(dep)) continue;
    out.push({ kind: 'field', key: dep, from });
  }
}

function guardRefs(guard: Guard | undefined, from: Where, scope: ChainScope, out: Reference[]): void {
  if (!guard) return;
  if ('ref' in guard) {
    const head = String(guard.ref).split('.')[0] ?? '';
    if (head) out.push({ kind: 'step', key: head, from, scope: 'chain' });
    return;
  }
  exprRefs(guard.expr, from, scope, out);
}

export function chainRefs(steps: Step[], whereOf: (index: number) => Where, params: Set<string>, eventChain: boolean): Reference[] {
  const out: Reference[] = [];
  const earlier = new Set<string>();
  steps.forEach((step, index) => {
    const from = whereOf(index);
    const scope: ChainScope = { params, earlier: new Set(earlier), eventChain };
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
      if (target && target !== '*' && !target.includes(':')) out.push({ kind: 'roll', key: target, from });
      if (mod.edit) out.push({ kind: 'rollEdit', key: String(mod.edit), from });
    }
    if (typeof mod.condition === 'string' && mod.condition.trim()) {
      exprRefs(mod.condition, from, { params: new Set(), earlier: new Set(), eventChain: false }, out);
    }
  }
}

export const MOMENT_PREFIX = 'moment:';
export const FIELD_PREFIX = 'field:';

export function listenerOf(
  on: string | undefined,
): { kind: 'any' | 'event' | 'effect' | 'moment' | 'field' | 'empty'; key?: string } {
  if (!on) return { kind: 'empty' };
  if (on === '*') return { kind: 'any' };
  if (on.startsWith(EVENT_PREFIX)) return { kind: 'event', key: on.slice(EVENT_PREFIX.length) };
  if (on.startsWith(MOMENT_PREFIX)) return { kind: 'moment', key: on.slice(MOMENT_PREFIX.length) };
  if (on.startsWith(FIELD_PREFIX)) return { kind: 'field', key: on.slice(FIELD_PREFIX.length) };
  return { kind: 'effect', key: on };
}

function effectRefs(system: System, id: string, effect: Effect, out: Reference[]): void {
  const params = new Set((effect.params ?? []).map(p => p.key));
  out.push(...chainRefs(effect.steps ?? [], step => ({ tab: 'effects', effect: id, step }), params, false));
  const head: Where = { tab: 'effects', effect: id, part: 'trigger' };
  const heard = listenerOf(effect.trigger?.on);
  if (heard.kind === 'event') out.push({ kind: 'event', key: heard.key!, from: head });
  if (heard.kind === 'effect') out.push({ kind: 'effect', key: heard.key!, from: head });
  if (heard.kind === 'field') out.push({ kind: 'field', key: heard.key!, from: head });
  const condition = effect.trigger?.condition;
  if (condition && typeof condition === 'object' && 'ref' in condition) {
    const listened = heard.kind === 'effect' ? system.effects[heard.key!] : undefined;
    const name = String(condition.ref).split('.')[0] ?? '';
    if (listened && name && !(listened.steps ?? []).some(s => s.id === name)) {
      out.push({ kind: 'step', key: name, from: head, scope: `listened:${heard.key}` });
    }
  } else if (condition) {
    slotRefs(condition, undefined, head, { params, earlier: new Set(), eventChain: false }, out);
  }
  for (const claim of effect.trigger?.claims ?? []) out.push({ kind: 'rollEdit', key: claim, from: head });
  if (effect.cost) out.push({ kind: 'actionType', key: effect.cost, from: { tab: 'effects', effect: id, part: 'cost' } });
  modifierRefs(effect.modifiers, { tab: 'effects', effect: id, part: 'modifiers' }, out);
}

export function referencesOf(system: System, compendium?: Compendium): Reference[] {
  const out: Reference[] = [];
  const noScope: ChainScope = { params: new Set(), earlier: new Set(), eventChain: false };

  for (const field of system.fields) {
    const from: Where = { tab: 'sheet', field: field.tag };
    if (field.value.kind === 'formula') exprRefs(field.value.expr, from, noScope, out);
    if (field.value.kind === 'table') {
      if (field.value.table) out.push({ kind: 'table', key: field.value.table, from });
      exprRefs(field.value.arg, from, noScope, out);
    }
  }

  for (const [id, effect] of Object.entries(system.effects ?? {})) effectRefs(system, id, effect, out);

  for (const [key, event] of Object.entries(system.events ?? {})) {
    out.push(...chainRefs(event.receive ?? [], step => ({ tab: 'rules', section: 'events', key, step }), new Set(), true));
  }

  for (const [kind, spec] of Object.entries(system.records ?? {})) {
    const own = new Set((spec.props ?? []).map(p => p.key));
    (spec.bindings ?? []).forEach((binding, index) => {
      const from: Where = { tab: 'records', kind, part: 'bindings', binding: index };
      if (binding.effect) out.push({ kind: 'effect', key: binding.effect, from });
      for (const arg of Object.values(binding.args ?? {})) {
        if (arg && typeof arg === 'object' && ('prop' in arg || 'item' in arg)) {
          const key = String((arg as { prop?: string; item?: string }).prop ?? (arg as { item?: string }).item ?? '');
          if (key) out.push({ kind: 'prop', key, from, scope: own.has(key) ? kind : 'foreign' });
        } else {
          slotRefs(arg, undefined, from, noScope, out);
        }
      }
    });
    modifierRefs(spec.modifiers, { tab: 'records', kind, part: 'modifiers' }, out);
  }

  for (const id of system.room_rules ?? []) out.push({ kind: 'effect', key: id, from: { tab: 'rules', section: 'room_rules', key: id } });

  if (system.initiative) {
    const from: Where = { tab: 'rules', section: 'initiative' };
    if (system.initiative.die?.constant) out.push({ kind: 'constant', key: system.initiative.die.constant, from });
    if (system.initiative.bonus) slotRefs(system.initiative.bonus, undefined, from, noScope, out);
    if (system.initiative.check) out.push({ kind: 'roll', key: system.initiative.check, from });
  }

  for (const list of [compendium?.items ?? [], compendium?.actions ?? []]) {
    for (const record of list) {
      const from: Where = { tab: 'book', record: record.id };
      if (record.rk) out.push({ kind: 'recordKind', key: String(record.rk), from });
      modifierRefs(record.modifiers, from, out);
    }
  }

  return out;
}
