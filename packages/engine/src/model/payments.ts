import type { System, Effect, Param } from './types.ts';

export function chosenEffect(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  const text = value && typeof value === 'object' ? String((value as { expr?: unknown }).expr ?? '').trim() : '';
  const quoted = /^"([^"]+)"$/.exec(text);
  return quoted ? quoted[1]! : null;
}

export function paymentsOf(system: System, effect: Effect, args: Record<string, unknown> = {}): { param: Param; id: string; payment: Effect }[] {
  const out: { param: Param; id: string; payment: Effect }[] = [];
  for (const param of effect.params ?? []) {
    if (param.kind !== 'effect') continue;
    const id = chosenEffect(args[param.key]) ?? (typeof param.default === 'string' ? param.default : null);
    const payment = id ? system.effects[id] : undefined;
    if (id && payment) out.push({ param, id, payment });
  }
  return out;
}

export function choicesOfInput(system: System, effectId: string, key: string): string[] {
  const effect = system.effects[effectId];
  const param = effect?.params?.find(p => p.key === key);
  if (!param || param.kind !== 'effect') return [];
  const out = new Set<string>();
  if (typeof param.default === 'string' && param.default) out.add(param.default);
  for (const table of Object.values(system.tables ?? {})) {
    for (const binding of table.bindings ?? []) {
      if (binding.effect !== effectId) continue;
      const id = chosenEffect((binding.args as Record<string, unknown> | undefined)?.[key]);
      if (id) out.add(id);
    }
  }
  return [...out];
}
