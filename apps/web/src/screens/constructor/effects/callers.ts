import type { System, Compendium, Binding, Param } from '@vtt/schema';
import { recordKinds, argsWithProps, propKeysOf, type RecordKind } from '@vtt/engine/model/owned';
import { tableOf } from '@vtt/engine/model/buttons';
import { chainsOfEffect } from '@vtt/engine/engine/effects';
import { emittedChoices } from '@vtt/engine/model/payments';
import { implicitOf } from '@vtt/engine/model/implicit';
import { paramsOf, basedOn } from '@vtt/engine/model/inherit';

export interface Caller {
  key: string;
  text: string;
  table?: string;
  effect?: string;
  missing: string[];
}

const free = (param: Param): boolean =>
  Boolean((param as { optional?: boolean }).optional) || param.ask !== undefined || param.default !== undefined;

function unfilled(system: System, binding: Binding, kind: RecordKind | undefined, params: Param[]): string[] {
  const args = argsWithProps(system, binding, propKeysOf(kind)) ?? {};
  const table = tableOf(binding, { params });
  return params.filter(param => !free(param) && args[param.key] === undefined && !table[param.key]).map(param => param.key);
}

export function callersOf(system: System, compendium: Compendium | null | undefined, id: string): Caller[] {
  const effect = system.effects[id];
  if (!effect) return [];
  const params = paramsOf(system, effect);
  const name = (binding: Binding) => binding.label || effect.label || id;
  const bases = new Set(recordKinds(system).map(([, kind]) => basedOn(kind)).filter(Boolean));
  const out: Caller[] = [];
  for (const [kind, spec] of recordKinds(system)) {
    (spec.bindings ?? []).forEach((binding, index) => {
      if (binding.effect !== id) return;
      out.push({
        key: `kind:${kind}:${index}`, text: `${spec.label || kind} · ${name(binding)}`, table: kind,
        missing: bases.has(kind) ? [] : unfilled(system, binding, spec, params),
      });
    });
  }
  for (const record of compendium?.records ?? []) {
    const kind = record.table ? system.tables?.[record.table] : undefined;
    (record.bindings ?? []).forEach((binding, index) => {
      if (binding.effect !== id) return;
      out.push({
        key: `record:${record.id}:${index}`, text: `${record.label || record.id} · ${name(binding)}`,
        ...(record.table ? { table: record.table } : {}),
        missing: unfilled(system, binding, kind, params),
      });
    });
  }
  for (const [other, caller] of Object.entries(system.effects)) {
    if (other === id) continue;
    const calls = (chainsOfEffect(caller).flat() as Record<string, unknown>[])
      .filter(step => step.type === 'emit' && emittedChoices(system, other, step.effect).includes(id));
    if (!calls.length) continue;
    const direct = calls.filter(step => typeof step.effect === 'string');
    const missing = params
      .filter(param => !free(param) && direct.some(step => (step.args as Record<string, unknown> | undefined)?.[param.key] === undefined && !implicitOf(param, caller)))
      .map(param => param.key);
    out.push({ key: `effect:${other}`, text: caller.label || other, effect: other, missing });
  }
  return out;
}
