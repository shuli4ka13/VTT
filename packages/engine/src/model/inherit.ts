import { EngineError } from '../engine/errors.ts';
import type { System, Effect, Table, SheetKind, Param, Step, Binding, Modifier } from './types.ts';
import { recordKinds, kindsOf } from './owned.ts';

type AnyKind = Table & SheetKind;

const MAX_CHAIN = 8;

type Loose = Record<string, unknown>;

function lineOf(id: string, basesOf: (key: string) => string | undefined, what: string): string[] {
  const chain: string[] = [];
  let at: string | undefined = id;
  while (at) {
    if (chain.includes(at)) {
      throw new EngineError(`${what} «${id}»: основы идут по кругу — ${[...chain, at].join(' → ')}`);
    }
    chain.push(at);
    if (chain.length > MAX_CHAIN) {
      throw new EngineError(`${what} «${id}»: основ больше ${MAX_CHAIN} — ${chain.join(' → ')}`);
    }
    at = basesOf(at);
  }
  return chain.reverse();
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

const union = (base: string[] | undefined, own: string[] | undefined): string[] => [...new Set([...(base ?? []), ...(own ?? [])])];

function dropEmpty(holder: Loose, keys: string[]): void {
  for (const key of keys) {
    const value = holder[key];
    if (Array.isArray(value) && !value.length) delete holder[key];
  }
}

function mergeEffect(base: Effect, own: Effect): Effect {
  const o = own as Loose;
  const merged: Loose = { ...base, ...own };
  merged.params = byKey((base.params ?? []) as Param[], (own.params ?? []) as Param[]);
  merged.modifiers = [...(base.modifiers ?? []), ...(own.modifiers ?? [])] as Modifier[];
  merged.self = o.self === undefined ? base.self : ([...(base.self ?? []), ...(own.self ?? [])] as Step[]);
  merged.steps = [...(base.steps ?? []), ...(own.steps ?? [])] as Step[];
  merged.on = [...(base.on ?? []), ...(own.on ?? [])];
  merged.attach = [...(base.attach ?? []), ...(own.attach ?? [])] as Step[];
  merged.detach = [...(base.detach ?? []), ...(own.detach ?? [])] as Step[];
  merged.grants = union(base.grants, own.grants);

  dropEmpty(merged, ['params', 'modifiers', 'self', 'steps', 'on', 'attach', 'detach', 'grants']);
  return merged as Effect;
}

function mergeKind<K extends Table | SheetKind>(base: K, own: K): K {
  const b = base as AnyKind;
  const o = own as AnyKind;
  const merged: Loose = { ...base, ...own };
  merged.columns = byKey(b.columns ?? [], o.columns ?? []);
  merged.bindings = byOrder(b.bindings ?? [], o.bindings ?? []);
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

export function paramsOf(system: System, effect: Effect): Param[] {
  const line: Effect[] = [];
  let at: Effect | undefined = effect;
  while (at && line.length <= MAX_CHAIN) {
    line.unshift(at);
    const base = basedOn(at);
    at = base ? system.effects?.[base] : undefined;
    if (at && line.includes(at)) break;
  }
  return line.reduce<Param[]>((done, one) => byKey(done, (one.params ?? []) as Param[]), []);
}

export function hasBases(system: System): boolean {
  for (const effect of Object.values(system.effects ?? {})) if (basedOn(effect)) return true;
  for (const [, kind] of kindsOf(system)) if (basedOn(kind)) return true;
  return false;
}

export function flattenSystem(system: System): System {
  if (!hasBases(system)) return system;

  const effects: Record<string, Effect> = {};
  for (const id of Object.keys(system.effects ?? {})) {
    const line = lineOf(id, key => {
      const at = basedOn(system.effects?.[key]);
      if (at && !system.effects?.[at]) {
        throw new EngineError(`эффект «${key}»: основы «${at}» в системе нет`);
      }
      return at;
    }, 'эффект');
    effects[id] = line.reduce<Effect>(
      (done, key) => (done ? mergeEffect(done, system.effects[key]!) : system.effects[key]!),
      undefined as unknown as Effect,
    );
  }

  const flat = <K extends Table | SheetKind>(all: Record<string, K>, mine: (key: string) => boolean): Record<string, K> => {
    const out: Record<string, K> = { ...all };
    for (const id of Object.keys(all).filter(mine)) {
      const line = lineOf(id, key => {
        const at = basedOn(all[key]);
        if (at && !(all[at] && mine(at))) throw new EngineError(`тип записи «${key}»: основы «${at}» в системе нет`);
        return at;
      }, 'тип записи');
      out[id] = line.reduce<K>((done, key) => (done ? mergeKind(done, all[key]!) : all[key]!), undefined as unknown as K);
    }
    return out;
  };
  const books = new Set(recordKinds(system).map(([id]) => id));

  return {
    ...system,
    effects,
    ...(system.tables && [...books].some(id => basedOn(system.tables![id])) ? { tables: flat(system.tables, id => books.has(id)) } : {}),
    ...(system.sheets ? { sheets: flat(system.sheets, () => true) } : {}),
  };
}
