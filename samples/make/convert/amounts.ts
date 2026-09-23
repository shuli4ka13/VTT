import { asOneFormula } from '../../../packages/engine/src/model/amounts.ts';
import type { System } from '../../../packages/engine/src/model/types.ts';

type Loose = Record<string, unknown>;

export function unifyAmounts(system: System): System {
  const touched = Object.values(system.effects ?? {}).some(effect =>
    [...(effect.steps ?? []), ...(effect.self ?? [])].some(step => asOneFormula(step) !== null));
  if (!touched) return system;

  const next = JSON.parse(JSON.stringify(system)) as System;
  for (const effect of Object.values(next.effects ?? {})) {
    for (const list of [effect.steps ?? [], effect.self ?? []]) {
      for (const step of list) {
        const one = asOneFormula(step);
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
