import { compile } from '../formula/index.ts';
import { ownerOf, owned, SENDER, RECEIVER, type Owner } from '../engine/owners.ts';
import type { System, Compendium, Effect } from './types.ts';
import { calledOf } from '../engine/effects.ts';

type Loose = Record<string, unknown>;

const depsOf = (expr: string): string[] => {
  try { return [...compile(expr).deps]; } catch { return []; }
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function withOwners(expr: string, fields: Set<string>, ownerFor: (name: string) => Owner): string {
  let out = expr;
  for (const dep of depsOf(expr)) {
    if (ownerOf(dep)) continue;
    const head = dep.split('.')[0]!;
    if (!fields.has(head)) continue;
    out = out.replace(
      new RegExp(`([@#])${escape(dep)}(?![\\p{L}\\p{N}_.])`, 'gu'),
      (_, mark: string) => `${mark}${owned(ownerFor(dep), dep)}`,
    );
  }
  return out;
}

const isSlot = (value: Loose): boolean =>
  typeof value.expr === 'string' && Object.keys(value).every(key => ['expr', 'of', 'sender', 'optional'].includes(key));

const unowned = (expr: string, fields: Set<string>): boolean =>
  depsOf(expr).some(dep => !ownerOf(dep) && fields.has(dep.split('.')[0]!));

const hasLegacy = (value: unknown, fields: Set<string>): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => hasLegacy(item, fields));
  const v = value as Loose;
  if (isSlot(v) && ('of' in v || 'sender' in v || unowned(String(v.expr), fields))) return true;
  return Object.values(v).some(item => hasLegacy(item, fields));
};

function rewriteSlot(slot: Loose, fields: Set<string>, called: boolean): void {
  const marked = new Set(Array.isArray(slot.sender) ? slot.sender.map(String) : []);
  const atTarget = called || slot.of === 'target';
  const next = withOwners(String(slot.expr), fields,
    name => (atTarget && !marked.has(name) && !marked.has(name.split('.')[0]!) ? RECEIVER : SENDER));
  const anyField = depsOf(next).some(dep => ownerOf(dep));
  slot.expr = next;
  delete slot.sender;
  if (!atTarget || anyField) delete slot.of;
}

function walkSlots(value: unknown, fields: Set<string>, called: boolean): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(item => walkSlots(item, fields, called)); return; }
  const v = value as Loose;
  if (isSlot(v)) { rewriteSlot(v, fields, called); return; }
  for (const [key, inner] of Object.entries(v)) {
    if (key === 'args') continue;
    walkSlots(inner, fields, called);
  }
}

const stepsOf = (effect: Effect): unknown[] => [...(effect.steps ?? []), ...(effect.self ?? [])];

function paramSide(system: System, effect: Effect | undefined, key: string, seen = new Set<Effect>()): Owner | null {
  if (!effect || seen.has(effect)) return null;
  seen.add(effect);
  const param = (effect.params ?? []).find(p => p.key === key) as Loose | undefined;
  if (param) return param.kind === 'expr' ? (param.of === 'target' ? RECEIVER : SENDER) : null;
  return paramSide(system, effect.extends ? system.effects[effect.extends] : undefined, key, seen);
}

function kindsBelow(system: System, kind: string): Set<string> {
  const out = new Set([kind]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, spec] of Object.entries(system.records ?? {})) {
      if (!out.has(id) && spec.extends && out.has(spec.extends)) { out.add(id); grew = true; }
    }
  }
  return out;
}

function rewriteArg(arg: unknown, side: Owner, fields: Set<string>): unknown {
  if (typeof arg === 'string') return withOwners(arg, fields, () => side);
  if (arg && typeof arg === 'object' && typeof (arg as Loose).expr === 'string') {
    const slot = { ...(arg as Loose) };
    slot.expr = withOwners(String(slot.expr), fields, () => side);
    delete slot.of;
    delete slot.sender;
    return slot;
  }
  return arg;
}

export function unifySides(world: { system: System; compendium: Compendium }): { system: System; compendium: Compendium } {
  const { system, compendium } = world;
  const effects = Object.values(system.effects ?? {});
  const known = new Set(system.fields.map(f => f.tag));
  const paramsWithSide = effects.some(e => (e.params ?? []).some(p => (p as Loose).kind === 'expr' && 'of' in (p as Loose)));
  if (!paramsWithSide && !effects.some(e => hasLegacy(stepsOf(e), known))) return world;

  const next = JSON.parse(JSON.stringify(system)) as System;
  const book = JSON.parse(JSON.stringify(compendium ?? {})) as Compendium;
  const fields = new Set(next.fields.map(f => f.tag));
  const calledIds = new Set(calledOf(next).map(([id]) => id));

  for (const [id, effect] of Object.entries(next.effects ?? {})) {
    const called = calledIds.has(id);
    for (const step of stepsOf(effect) as Loose[]) {
      if (step.type === 'emit' && step.args && typeof step.args === 'object') {
        const target = next.effects[String(step.event)];
        for (const [key, arg] of Object.entries(step.args as Loose)) {
          const side = paramSide(next, target, key);
          if (side) (step.args as Loose)[key] = rewriteArg(arg, side, fields);
          else walkSlots(arg, fields, called);
        }
      }
      walkSlots(step, fields, called);
    }
  }

  for (const [kind, spec] of Object.entries(next.records ?? {})) {
    for (const binding of spec.bindings ?? []) {
      const effect = next.effects[binding.effect];
      const kinds = kindsBelow(next, kind);
      for (const [key, arg] of Object.entries(binding.args ?? {})) {
        const side = paramSide(next, effect, key);
        if (!side) continue;
        const prop = arg && typeof arg === 'object' && 'prop' in (arg as Loose) ? String((arg as Loose).prop) : null;
        if (!prop) { (binding.args as Loose)[key] = rewriteArg(arg, side, fields); continue; }
        for (const record of [...(book.items ?? []), ...(book.actions ?? [])]) {
          if (!kinds.has(String(record.rk)) || !record.props || typeof record.props[prop] !== 'string') continue;
          record.props[prop] = withOwners(String(record.props[prop]), fields, () => side);
        }
      }
    }
  }

  for (const effect of Object.values(next.effects ?? {})) {
    for (const param of effect.params ?? []) {
      if ((param as Loose).kind === 'expr') delete (param as Loose).of;
    }
  }
  return { system: next, compendium: book };
}
