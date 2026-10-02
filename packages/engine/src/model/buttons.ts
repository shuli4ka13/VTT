import type { Binding, Effect, TableFill } from './types.ts';

export function tableOf(binding: Pick<Binding, 'table'>, effect: Pick<Effect, 'params'>): Record<string, TableFill> {
  if (binding.table) return binding.table;
  const sheets = (effect.params ?? []).filter(param => param.kind === 'sheet');
  const actor = sheets.find(param => !param.many);
  const targets = sheets.find(param => param.many);
  return { ...(actor ? { [actor.key]: 'actor' as const } : {}), ...(targets ? { [targets.key]: 'targets' as const } : {}) };
}
