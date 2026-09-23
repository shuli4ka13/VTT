import type { System } from '@vtt/schema';
import type { Where } from '@vtt/engine/model/references';

type Loose = Record<string, unknown>;

export interface Filler { where: Where; label: string; missing: string[] }

const needs = (system: System, id: string) =>
  (system.effects[id]?.params ?? []).filter(p => !(p as Loose).optional && !(p as Loose).ask);

export function fillersOf(system: System, id: string): Filler[] {
  const out: Filler[] = [];
  const required = needs(system, id);
  const missingIn = (args: unknown) => required
    .filter(p => ((args ?? {}) as Loose)[p.key] === undefined)
    .map(p => p.label ?? p.key);

  for (const [owner, effect] of Object.entries(system.effects ?? {})) {
    const chains: [unknown[], 'steps' | 'self'][] = [[effect.steps ?? [], 'steps'], [effect.self ?? [], 'self']];
    for (const [steps, part] of chains) {
      steps.forEach((step, at) => {
        const s = step as Loose;
        if (s.type !== 'emit' || s.event !== id) return;
        out.push({
          where: { tab: 'effects', effect: owner, step: at, ...(part === 'self' ? { part: 'self' as const } : {}) },
          label: `вызов из «${effect.label || owner}»`,
          missing: missingIn(s.args),
        });
      });
    }
  }

  for (const [kind, spec] of Object.entries(system.records ?? {})) {
    (spec.bindings ?? []).forEach((binding, at) => {
      if (binding.effect !== id) return;
      out.push({
        where: { tab: 'records', kind, binding: at },
        label: `запись «${spec.label || kind}» · кнопка «${binding.label || 'без названия'}»`,
        missing: missingIn(binding.args),
      });
    });
  }
  return out;
}
