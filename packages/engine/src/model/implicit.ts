import type { Effect, Param, Step } from './types.ts';

export type Implicit =
  | { by: 'name'; from: string }
  | { by: 'target'; from: string }
  | { by: 'actor'; from: string };

const sameKind = (a: Param, b: Param): boolean => (a.kind ?? 'number') === (b.kind ?? 'number') && Boolean(a.many) === Boolean(b.many);

export function loopItemOf(caller: Pick<Effect, 'params' | 'steps'>): string | null {
  const each = (caller.steps ?? []).find((step: Step) => step.type === 'each') as { of?: unknown; as?: unknown } | undefined;
  if (!each) return null;
  if (typeof each.as === 'string' && each.as) return each.as;
  const list = (caller.params ?? []).find(p => p.key === each.of);
  return list?.item?.key ?? null;
}

export const HOLDER = 'носитель';

export function actorOf(caller: Pick<Effect, 'params' | 'activation'>): string | null {
  const sheets = (caller.params ?? []).filter(p => p.kind === 'sheet');
  const declared = sheets.find(p => p.role === 'actor');
  if (declared) return declared.key;
  if ((caller.activation ?? 'manual') === 'passive') return HOLDER;
  return sheets.find(p => !p.many)?.key ?? null;
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
