import type { Binding, Effect, TableFill } from './types.ts';

export function rolesOf(effect: Pick<Effect, 'params'>): { actor?: string; targets?: string } {
  const sheets = (effect.params ?? []).filter(param => param.kind === 'sheet');
  const singles = sheets.filter(param => !param.many);
  const actor = singles.find(param => param.role === 'actor') ?? singles.find(param => param.role !== 'target');
  const targets = sheets.find(param => param.many) ?? singles.find(param => param.role === 'target');
  return { ...(actor ? { actor: actor.key } : {}), ...(targets ? { targets: targets.key } : {}) };
}

export function tableOf(binding: Pick<Binding, 'table'>, effect: Pick<Effect, 'params'>): Record<string, TableFill> {
  if (binding.table) return binding.table;
  const { actor, targets } = rolesOf(effect);
  return { ...(actor ? { [actor]: 'actor' as const } : {}), ...(targets ? { [targets]: 'targets' as const } : {}) };
}
