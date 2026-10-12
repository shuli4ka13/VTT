import type { System, Effect, Param, Compendium } from './types.ts';

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

function chosenByCells(system: System, compendium: Compendium | undefined, effectId: string, key: string): { kind: string; id: string }[] {
  const out: { kind: string; id: string }[] = [];
  for (const record of [...(system.library ?? []), ...(compendium?.records ?? [])]) {
    if (!record.table) continue;
    const bound = [...(system.tables?.[record.table]?.bindings ?? []), ...(record.bindings ?? [])].some(binding => binding.effect === effectId);
    const id = bound ? chosenEffect(record.cells?.[key]) : null;
    if (id) out.push({ kind: record.table, id });
  }
  return out;
}

export function choicesOfInput(system: System, effectId: string, key: string, compendium?: Compendium): string[] {
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
  if (compendium) for (const cell of chosenByCells(system, compendium, effectId, key)) out.add(cell.id);
  return [...out];
}

export function emittedChoices(system: System, effectId: string, raw: unknown, compendium?: Compendium): string[] {
  if (typeof raw === 'string') return raw ? [raw] : [];
  const literal = chosenEffect(raw);
  if (literal) return [literal];
  const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((raw as { expr?: unknown } | null)?.expr ?? ''));
  return lone ? choicesOfInput(system, effectId, lone[1]!, compendium) : [];
}
