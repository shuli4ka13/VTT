import { asOneFormula } from '../../../packages/engine/src/model/amounts.ts';
import type { System } from '../../../packages/engine/src/model/types.ts';

type Loose = Record<string, unknown>;

const chainsOf = (effect: System['effects'][string]) => [
  effect.steps ?? [], effect.self ?? [],
  ...(effect.on ?? []).flatMap(handler => [handler.steps ?? [], handler.self ?? []]),
];

const LEGACY = ['tag', 'ref', 'item', 'prop', 'param'];

const modern = (step: unknown): unknown => {
  const s = { ...(step as Loose) };
  for (const key of ['count', 'bonus']) {
    const ref = s[key] as Loose | undefined;
    const form = ref && typeof ref === 'object' ? LEGACY.find(name => name in ref) : undefined;
    if (form && key === 'count') s[key] = { expr: `@${String(ref![form])}` };
    else if (form && form !== 'param') s[key] = { expr: `@${String(ref![form])}` };
  }
  return s;
};

const oneFormula = (step: unknown): string | null => asOneFormula(modern(step) as never);

export function unifyAmounts(system: System): System {
  const touched = Object.values(system.effects ?? {}).some(effect =>
    chainsOf(effect).flat().some(step => oneFormula(step) !== null));
  if (!touched) return system;

  const next = JSON.parse(JSON.stringify(system)) as System;
  for (const effect of Object.values(next.effects ?? {})) {
    for (const list of chainsOf(effect)) {
      for (const step of list) {
        const one = oneFormula(step);
        if (!one) continue;
        const s = step as Loose;
        delete s.dice;
        delete s.bonus;
        delete s.count;
        s.source = 'item';
        s.fixed = { expr: one };
      }
    }
  }
  return next;
}
