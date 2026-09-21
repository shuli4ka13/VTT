import type { System, Step } from './types.ts';

type Loose = Record<string, any>;

const nameOf = (ref: unknown): string | null => {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'number') return String(ref);
  if (typeof ref !== 'object') return `'${String(ref)}'`;
  const r = ref as Loose;
  if ('const' in r) {
    const value = r.const;
    return typeof value === 'number' ? String(value) : `'${String(value)}'`;
  }
  if ('tag' in r) return `@${String(r.tag)}`;
  if ('param' in r) return `@${String(r.param)}`;
  if ('prop' in r || 'item' in r) return `@${String(r.prop ?? r.item)}`;
  if ('ref' in r) return `@${String(r.ref)}`;
  if ('expr' in r) return `(${String(r.expr)})`;
  return null;
};

export function asOneFormula(step: Step): string | null {
  const s = step as Loose;
  if (s.type !== 'amount') return null;
  if (s.fixed !== undefined && s.dice === undefined) return null;

  const dice = nameOf(s.dice);
  if (!dice) return null;

  const times = nameOf(s.count);
  const rolled = times ? `кинуть(${dice}, ${times})` : `кинуть(${dice})`;

  const parts = [rolled];
  const bonus = nameOf(s.bonus);
  if (bonus) parts.push(bonus);
  return parts.join(' + ');
}

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
