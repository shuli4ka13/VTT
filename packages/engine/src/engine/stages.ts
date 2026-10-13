import { EngineError } from './errors.ts';
import type { System, Stage, Param } from '../model/types.ts';
import { fieldOf, columnOfField } from '../model/sheet-columns.ts';

export type Combine = 'last' | 'min' | 'max' | 'sum' | 'product';

export const COMBINE_DEFAULT = { set: 'last', add: 'sum', mul: 'product' } as const;
export const VALUE_OPS = ['set', 'add', 'mul', 'floor', 'cap'];

const IMPLICIT: Stage = { key: '' };

interface Staged { op?: string; stage?: string }

const combined = (rule: Combine, values: number[] | unknown[]): unknown => {
  if (rule === 'last') return values[values.length - 1];
  const numbers = values as number[];
  if (rule === 'min') return Math.min(...numbers);
  if (rule === 'max') return Math.max(...numbers);
  if (rule === 'sum') return numbers.reduce((a, b) => a + b, 0);
  return numbers.reduce((a, b) => a * b, 1);
};

const rounded = (value: number, round: Stage['round']): number =>
  round === 'down' ? Math.floor(value) : round === 'up' ? Math.ceil(value) : round === 'near' ? Math.round(value) : value;

export function stageOf<M extends Staged>(mod: M, stages: readonly Stage[], label: string): string {
  if (!stages.length) return '';
  const key = mod.stage ?? stages[0]!.key;
  if (!stages.some(stage => stage.key === key)) {
    throw new EngineError(`правка «${label}» ссылается на этап «${key}», а у величины такого этапа нет`);
  }
  return key;
}

export function stackStages<M extends Staged>(
  mods: readonly M[], base: unknown, label: string, value: (mod: M) => unknown, stages: readonly Stage[] = [],
): unknown {
  const unknown = mods.find(m => !VALUE_OPS.includes(String(m.op)));
  if (unknown) throw new EngineError(`неизвестная операция модификатора «${unknown.op}» на мишени «${label}»`);
  const plan = stages.length ? stages : [IMPLICIT];
  let result = base;
  for (const stage of plan) {
    const entry = result;
    const mine = mods.filter(m => stageOf(m, stages, label) === stage.key);
    const of = (op: string) => mine.filter(m => m.op === op).map(value);
    const rule = (op: 'set' | 'add' | 'mul'): Combine => (stage.combine?.[op] ?? COMBINE_DEFAULT[op]) as Combine;
    const sets = of('set');
    if (sets.length) result = combined(rule('set'), sets);
    const adds = of('add');
    if (adds.length) result = (result as number) + (combined(rule('add'), adds) as number);
    const muls = of('mul');
    if (muls.length) result = (result as number) * (combined(rule('mul'), muls) as number);
    const floors = of('floor') as number[];
    if (floors.length) result = Math.max(result as number, ...floors);
    const caps = of('cap') as number[];
    if (caps.length) result = Math.min(result as number, ...caps);
    if (typeof result === 'number' && typeof entry === 'number') {
      if (stage.upTo !== undefined) result = Math.min(result as number, entry + stage.upTo);
      if (stage.upToTimes !== undefined) result = Math.min(result as number, Math.ceil(entry * stage.upToTimes));
    }
    if (typeof result === 'number') {
      const lifted: number = stage.atLeast !== undefined ? Math.max(result, stage.atLeast) : result;
      result = rounded(lifted, stage.round);
    }
  }
  return result;
}

export const paramStages = (params: readonly Param[] | undefined, key: string): Stage[] =>
  ((params ?? []).find(p => p.key === key) as { stages?: Stage[] } | undefined)?.stages ?? [];

export function targetStages(system: System, tag: string): Stage[] {
  const field = fieldOf(system, tag);
  if (field) return (columnOfField(system, field) as { stages?: Stage[] } | undefined)?.stages ?? [];
  const parts = tag.replace(/^cell:/, '').split('.');
  if (parts.length < 3) return [];
  const column = (system.tables?.[parts[0]!]?.columns ?? []).find(c => c.key === parts[parts.length - 1]);
  return (column as { stages?: Stage[] } | undefined)?.stages ?? [];
}
