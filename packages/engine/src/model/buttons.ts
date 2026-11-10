import type { Effect } from './types.ts';

export type TableFill = 'actor' | 'targets';

export function rolesOf(effect: Pick<Effect, 'params'>): { actor?: string; targets?: string } {
  const sheets = (effect.params ?? []).filter(param => param.kind === 'sheet');
  const singles = sheets.filter(param => !param.many);
  const actor = singles.find(param => param.role === 'actor') ?? singles.find(param => param.role !== 'target');
  const targets = sheets.find(param => param.many) ?? singles.find(param => param.role === 'target');
  return { ...(actor ? { actor: actor.key } : {}), ...(targets ? { targets: targets.key } : {}) };
}

export function tableOf(effect: Pick<Effect, 'params'>): Record<string, TableFill> {
  const { actor, targets } = rolesOf(effect);
  return { ...(actor ? { [actor]: 'actor' as const } : {}), ...(targets ? { [targets]: 'targets' as const } : {}) };
}
