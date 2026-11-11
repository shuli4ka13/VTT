import { isSingle, rollEntryOf } from './sheet-columns.ts';
import type { System, Param, Step } from './types.ts';

const FIELD_ADDRESS = /^\s*@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)\s*$/u;

export function rolledColumn(system: System, params: readonly Param[], address: unknown): { table: string; column: string } | null {
  const tail = FIELD_ADDRESS.exec(String((address as { expr?: unknown } | undefined)?.expr ?? ''))?.[1]?.split('.');
  if (!tail) return null;
  const column = tail[tail.length - 1]!;
  if (tail.length === 1) {
    const home = Object.entries(system.tables ?? {}).find(([, table]) => isSingle(table) && (table.columns ?? []).some(one => one.key === column));
    return home ? { table: home[0], column } : null;
  }
  const input = params.find(param => param.key === tail[0] && param.kind === 'choice' && param.from);
  if (tail.length === 2) return input?.from && system.tables?.[input.from] ? { table: input.from, column } : null;
  return tail.length === 3 && system.tables?.[tail[0]!] && !isSingle(system.tables[tail[0]!]!) ? { table: tail[0]!, column } : null;
}

export type Graded = { success: boolean; margin: boolean; degree: boolean };

export function fieldGives(system: System, params: readonly Param[], step: Step): Graded | null {
  const at = rolledColumn(system, params, (step as { field?: unknown }).field);
  const found = at ? rollEntryOf(system, at.table, at.column) : undefined;
  if (!found) return null;
  const kind = found.roll.number;
  const graded = kind === 'under' || kind === 'over' || found.entry.threshold !== undefined;
  return {
    success: graded || Boolean(found.roll.success),
    margin: graded || Boolean(found.roll.margin),
    degree: Boolean(found.roll.degrees?.length),
  };
}

export function thrownDie(system: System, params: readonly Param[], step: Step): string | null {
  const it = step as { die?: unknown; field?: unknown };
  if (typeof it.die === 'string') return it.die;
  if (it.field === undefined || it.field === null) return null;
  const at = rolledColumn(system, params, it.field);
  return at ? rollEntryOf(system, at.table, at.column)?.roll.die ?? null : null;
}

export function dieParts(system: System, die: string | null): { name: string; label: string }[] {
  const terms = (die ? system.constants?.[die]?.dice : undefined) ?? [];
  return terms.flatMap(term => (term.name ? [{ name: term.name, label: term.label || term.name }] : []));
}
