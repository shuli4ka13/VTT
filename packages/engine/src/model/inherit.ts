import { EngineError } from '../engine/errors.ts';
import type { System, Effect, RecordKind, Param, Step, Binding, Modifier } from './types.ts';

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

const byOrder = (base: Binding[], own: Binding[]): Binding[] => own.map((item, at) => {
  const was = base[at];
  return was ? { ...was, ...item, args: { ...(was.args ?? {}), ...(item.args ?? {}) } } : item;
}).concat(base.slice(own.length));

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

  dropEmpty(merged, ['params', 'modifiers', 'self', 'steps']);
  return merged as Effect;
}

function mergeKind(base: RecordKind, own: RecordKind): RecordKind {
  const merged: Loose = { ...base, ...own };
  merged.props = byKey((base.props ?? []) as { key: string }[], (own.props ?? []) as { key: string }[]);
  merged.bindings = byOrder((base.bindings ?? []) as Binding[], (own.bindings ?? []) as Binding[]);
  merged.modifiers = [...(base.modifiers ?? []), ...(own.modifiers ?? [])] as Modifier[];

  dropEmpty(merged, ['props', 'bindings', 'modifiers']);
  return merged as RecordKind;
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
  for (const kind of Object.values(system.records ?? {})) if (basedOn(kind)) return true;
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

  const records: Record<string, RecordKind> = {};
  for (const id of Object.keys(system.records ?? {})) {
    const line = lineOf(id, key => {
      const at = basedOn(system.records?.[key]);
      if (at && !system.records?.[at]) {
        throw new EngineError(`тип записи «${key}»: основы «${at}» в системе нет`);
      }
      return at;
    }, 'тип записи');
    records[id] = line.reduce<RecordKind>(
      (done, key) => (done ? mergeKind(done, system.records![key]!) : system.records![key]!),
      undefined as unknown as RecordKind,
    );
  }

  return {
    ...system,
    effects,
    ...(system.records ? { records } : {}),
  };
}
