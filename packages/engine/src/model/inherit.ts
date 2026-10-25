import { EngineError } from '../engine/errors.ts';
import type { System, Effect, Table, SheetKind, Param, Binding, Modifier } from './types.ts';
import { recordKinds, kindsOf } from './owned.ts';

type AnyKind = Table & SheetKind;

const MAX_CHAIN = 8;

type Loose = Record<string, unknown>;

export function lineTrouble(id: string, basesOf: (key: string) => string | undefined, exists: (key: string) => boolean): string | null {
  const chain: string[] = [];
  let at: string | undefined = id;
  while (at) {
    if (chain.includes(at)) return `основы идут по кругу — ${[...chain, at].join(' → ')}`;
    chain.push(at);
    if (chain.length > MAX_CHAIN) return `основ больше ${MAX_CHAIN} — ${chain.join(' → ')}`;
    const next = basesOf(at);
    if (next && !exists(next)) return `основы «${next}» в системе нет`;
    at = next;
  }
  return null;
}

function lineOf(id: string, basesOf: (key: string) => string | undefined, exists: (key: string) => boolean, what: string, lenient: boolean): string[] {
  const chain: string[] = [];
  let at: string | undefined = id;
  while (at && !chain.includes(at) && chain.length < MAX_CHAIN + 1) {
    chain.push(at);
    const next = basesOf(at);
    at = next && exists(next) ? next : undefined;
  }
  if (!lenient) {
    const trouble = lineTrouble(id, basesOf, exists);
    if (trouble) throw new EngineError(`${what} «${id}»: ${trouble}`);
  }
  return chain.slice(0, MAX_CHAIN).reverse();
}

const byKey = <T extends { key: string }>(base: T[], own: T[]): T[] => {
  const out = [...base];
  for (const item of own) {
    const at = out.findIndex(other => other.key === item.key);
    if (at < 0) out.push(item); else out[at] = { ...out[at], ...item };
  }
  return out;
};

export const byOrder = (base: Binding[], own: Binding[]): Binding[] => own.map((item, at) => {
  const was = base[at];
  return was ? { ...was, ...item, args: { ...(was.args ?? {}), ...(item.args ?? {}) } } : item;
}).concat(base.slice(own.length));

export const byEffect = (base: Binding[], own: Binding[]): Binding[] => {
  const out = base.map(item => ({ ...item }));
  for (const item of own) {
    const at = out.findIndex(was => was.effect === item.effect);
    if (at < 0) out.push(item);
    else out[at] = { ...out[at]!, ...item, args: { ...(out[at]!.args ?? {}), ...(item.args ?? {}) } };
  }
  return out;
};

const union = (base: string[] | undefined, own: string[] | undefined): string[] => [...new Set([...(base ?? []), ...(own ?? [])])];

function dropEmpty(holder: Loose, keys: string[]): void {
  for (const key of keys) {
    const value = holder[key];
    if (Array.isArray(value) && !value.length) delete holder[key];
  }
}

function mergeKind<K extends Table | SheetKind>(base: K, own: K): K {
  const b = base as AnyKind;
  const o = own as AnyKind;
  const merged: Loose = { ...base, ...own };
  merged.columns = byKey(b.columns ?? [], o.columns ?? []);
  merged.bindings = byEffect(b.bindings ?? [], o.bindings ?? []);
  merged.modifiers = [...(b.modifiers ?? []), ...(o.modifiers ?? [])] as Modifier[];
  merged.grants = union(b.grants, o.grants);
  merged.blocks = union(b.blocks, o.blocks);

  dropEmpty(merged, ['columns', 'bindings', 'modifiers', 'grants', 'blocks']);
  return merged as K;
}

export const basedOn = (thing: unknown): string | undefined => {
  const at = (thing as Loose | undefined)?.extends;
  return typeof at === 'string' && at ? at : undefined;
};

export function paramsOf(_system: System, effect: Effect): Param[] {
  return (effect.params ?? []) as Param[];
}

export function hasBases(system: System): boolean {
  for (const [, kind] of kindsOf(system)) if (basedOn(kind)) return true;
  return false;
}

const flattened = new WeakSet<System>();
const made = { strict: new WeakMap<System, System>(), lenient: new WeakMap<System, System>() };

export function flattenSystem(system: System, lenient = false): System {
  if (flattened.has(system) || !hasBases(system)) return system;
  const memo = lenient ? made.lenient : made.strict;
  const known = memo.get(system);
  if (known) return known;

  const flat = <K extends Table | SheetKind>(all: Record<string, K>, mine: (key: string) => boolean): Record<string, K> => {
    const out: Record<string, K> = { ...all };
    for (const id of Object.keys(all).filter(mine)) {
      const line = lineOf(id, key => basedOn(all[key]), key => Boolean(all[key] && mine(key)), 'тип записи', lenient);
      out[id] = line.reduce<K>((done, key) => (done ? mergeKind(done, all[key]!) : all[key]!), undefined as unknown as K);
    }
    return out;
  };
  const books = new Set(recordKinds(system).map(([id]) => id));

  const out: System = {
    ...system,
    ...(system.tables && [...books].some(id => basedOn(system.tables![id])) ? { tables: flat(system.tables, id => books.has(id)) } : {}),
    ...(system.sheets ? { sheets: flat(system.sheets, () => true) } : {}),
  };
  flattened.add(out);
  memo.set(system, out);
  return out;
}
