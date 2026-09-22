import type { System, FieldOption, Field, Effect } from './types.ts';

export function listOf(system: System, key: string | undefined): FieldOption[] | undefined {
  if (!key) return undefined;
  return system.lists?.[key]?.values;
}

export function optionsOf(system: System, field: Field): FieldOption[] {
  return listOf(system, field.optionsFrom) ?? field.options ?? [];
}

export function tagsOf(system: System, effect: Effect): string[] {
  const fromList = listOf(system, effect.tagsFrom);
  if (fromList) return fromList.map(option => String(option.value));
  return effect.tags ?? [];
}

export function listUsers(system: System, key: string): string[] {
  const out: string[] = [];
  const from = (thing: unknown): string | undefined => (thing as { from?: string }).from;
  for (const field of system.fields ?? []) {
    if (field.optionsFrom === key) out.push(`поле «${field.label}»`);
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    if (effect.tagsFrom === key) out.push(`эффект «${effect.label ?? id}»`);
    for (const param of (effect.params ?? [])) {
      if (from(param) === key) out.push(`«${param.label ?? param.key}» у эффекта «${effect.label ?? id}»`);
    }
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    for (const prop of (kind.props ?? [])) {
      if (from(prop) === key) out.push(`свойство «${prop.label ?? prop.key}» у типа «${kind.label ?? rk}»`);
    }
  }
  return out;
}
