import type { System, Param, FieldOption } from '@vtt/schema';
import { listOf } from '@vtt/engine';

const textOf = (value: unknown): string =>
  (typeof value === 'string' ? value : String((value as { expr?: unknown } | null | undefined)?.expr ?? '')).trim();

export const choiceRows = (system: System, param: Param): FieldOption[] =>
  (param.kind === 'choice' && param.from && !param.many ? listOf(system, param.from) ?? [] : []);

export const pickedRow = (system: System, param: Param, value: unknown): FieldOption | undefined => {
  const text = textOf(value);
  return text ? choiceRows(system, param).find(row => JSON.stringify(row.value) === text) : undefined;
};
