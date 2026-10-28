import { loopOf } from '../engine/steps/each.ts';
import { splitsTargets } from '../engine/steps/index.ts';
import { rolesOf } from './buttons.ts';
import type { Effect, Param } from './types.ts';

export type Implicit =
  | { by: 'name'; from: string }
  | { by: 'target'; from: string }
  | { by: 'actor'; from: string };

export type Applied = Implicit | { by: 'to' };

const sameKind = (a: Param, b: Param): boolean => (a.kind ?? 'number') === (b.kind ?? 'number') && Boolean(a.many) === Boolean(b.many)
  && (a.kind !== 'choice' || !a.from || !b.from || a.from === b.from);

export function loopItemOf(caller: Pick<Effect, 'params' | 'steps'>): string | null {
  const split = (caller.steps ?? []).find(splitsTargets) as { of?: unknown } | undefined;
  return split ? loopOf(caller.params, split)?.key ?? null : null;
}

export const HOLDER = 'носитель';

export function actorOf(caller: Pick<Effect, 'params' | 'activation'>): string | null {
  const declared = (caller.params ?? []).find(p => p.kind === 'sheet' && !p.many && p.role === 'actor');
  if (declared) return declared.key;
  if ((caller.activation ?? 'manual') === 'passive') return HOLDER;
  return rolesOf(caller).actor ?? null;
}

export function implicitOf(param: Param, caller: Pick<Effect, 'params' | 'steps' | 'activation'>): Implicit | null {
  if (param.kind === 'field') return null;
  if (param.kind === 'sheet' && !param.many && param.role === 'target') {
    const item = loopItemOf(caller);
    return item ? { by: 'target', from: item } : null;
  }
  if (param.kind === 'sheet' && !param.many && param.role === 'actor') {
    const actor = actorOf(caller);
    return actor ? { by: 'actor', from: actor } : null;
  }
  if (param.default !== undefined) return null;
  const own = (caller.params ?? []).find(p => p.key === param.key);
  if (own && sameKind(own, param)) return { by: 'name', from: own.key };
  return null;
}

export const storable = (param: Param): boolean => param.kind !== 'roll' && param.kind !== 'field' && !param.many;

export function appliedOf(param: Param, caller: Pick<Effect, 'params' | 'steps' | 'activation'>): Applied | null {
  if (!storable(param)) return null;
  if (param.kind === 'sheet' && param.role === 'target') return { by: 'to' };
  return implicitOf(param, caller);
}
