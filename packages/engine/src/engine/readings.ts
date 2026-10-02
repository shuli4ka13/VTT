import { EngineError } from './errors.ts';

export interface ReadSpec { kind: string; [key: string]: unknown }

const KINDS: Record<string, string> = { sum: 'сумма', best: 'лучшая', worst: 'худшая', count: 'счёт успехов' };

export const readingKinds = () =>
  Object.entries(KINDS).map(([kind, label]) => ({ kind, label }));

export function readingOf(raw: unknown): ReadSpec {
  if (raw === undefined || raw === null || raw === '') return { kind: 'sum' };
  if (typeof raw === 'string') return { kind: raw };
  if (typeof raw === 'object' && 'kind' in raw) return raw as ReadSpec;
  throw new EngineError(
    `не понимаю чтение костей «${JSON.stringify(raw)}» — жду имя чтения или { kind, … }`);
}
