import type { System, Compendium, Param, Binding, Effect } from './types.ts';
import { recordKinds } from './owned.ts';
import { tableOf } from './buttons.ts';
import { chainsOfEffect } from '../engine/effects.ts';
import { implicitOf } from './implicit.ts';

export type OriginKind = 'actor' | 'targets' | 'cell' | 'formula' | 'call' | 'self' | 'ask' | 'default';

export interface Origin {
  kind: OriginKind;
  text: string;
  table?: string;
  effect?: string;
  place?: string;
  button?: string;
  field?: string;
}

const quoted = (text: string | undefined, fallback: string): string => `«${text || fallback}»`;

function fromBinding(binding: Binding, effect: Effect, param: Param, owner: string, columns: readonly { key: string; label?: string }[], table?: string): Origin | null {
  const where = `${quoted(binding.label, 'кнопка')} у ${owner}`;
  const at = { place: owner.replace(/^«|»$/g, ''), ...(binding.label ? { button: binding.label } : {}), ...(table ? { table } : {}) };
  const fill = tableOf(binding, effect)[param.key];
  if (fill === 'actor') return { kind: 'actor', text: `${where}: кто нажал`, ...at };
  if (fill === 'targets') return { kind: 'targets', text: `${where}: цели со стола`, ...at };
  if (binding.args?.[param.key] !== undefined) return { kind: 'formula', text: `${where}: считается само`, ...at };
  const column = columns.find(c => c.key === param.key);
  if (column) return { kind: 'cell', text: `клетка ${owner.replace(/»$/, '')} · ${column.label || column.key}»`, ...at, field: column.label || column.key };
  return null;
}

export function originsOf(system: System, compendium: Compendium | null | undefined, effectId: string, param: Param): Origin[] {
  const effect = system.effects?.[effectId];
  if (!effect) return [];
  const out: Origin[] = [];
  for (const [key, table] of recordKinds(system)) {
    for (const binding of table.bindings ?? []) {
      if (binding.effect !== effectId) continue;
      const found = fromBinding(binding, effect, param, quoted(table.label, key), table.columns ?? [], key);
      if (found) out.push(found);
    }
  }
  for (const record of compendium?.records ?? []) {
    const own = (record as { bindings?: Binding[] }).bindings ?? [];
    const table = record.table ? system.tables?.[record.table] : undefined;
    for (const binding of own) {
      if (binding.effect !== effectId) continue;
      const found = fromBinding(binding, effect, param, quoted((record as { label?: string }).label, record.id), table?.columns ?? [], record.table);
      if (found) out.push(found);
    }
  }
  for (const [other, caller] of Object.entries(system.effects ?? {})) {
    if (other === effectId) continue;
    const calls = (chainsOfEffect(caller).flat() as Record<string, unknown>[])
      .filter(step => step.type === 'emit' && step.effect === effectId);
    if (!calls.length) continue;
    if (calls.some(step => (step.args as Record<string, unknown> | undefined)?.[param.key] !== undefined)) {
      out.push({ kind: 'call', text: `из ${quoted(caller.label, other)}`, effect: other, place: caller.label || other });
    } else if (implicitOf(param, caller)?.by === 'name') {
      out.push({ kind: 'self', text: `сам из ${quoted(caller.label, other)}`, effect: other, place: caller.label || other });
    }
  }
  if (param.role === 'target') out.push({ kind: 'self', text: 'сам: текущая цель' });
  if (param.role === 'actor') out.push({ kind: 'self', text: 'сам: кто действует' });
  if (param.ask) out.push({ kind: 'ask', text: param.ask.by === 'gm' ? 'спросят ведущего' : 'спросят игрока' });
  if (param.default !== undefined) {
    const shown = typeof param.default === 'string' && system.effects?.[param.default]
      ? quoted(system.effects[param.default]!.label, param.default) : String(param.default);
    out.push({ kind: 'default', text: `иначе — ${shown}` });
  }
  const seen = new Set<string>();
  return out.filter(origin => (seen.has(origin.text) ? false : (seen.add(origin.text), true)));
}
