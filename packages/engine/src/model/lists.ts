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
  for (const field of system.fields ?? []) {
    if (field.optionsFrom === key) out.push(`поле «${field.label}»`);
  }
  for (const effect of Object.values(system.effects ?? {})) {
    if (effect.tagsFrom === key) out.push(`эффект «${effect.label ?? ''}»`);
  }
  return out;
}
