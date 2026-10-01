import { EngineError } from './errors.ts';

export interface RolledDie {
  value: number;
  sides: number;
  name?: string;

  bonus?: boolean;

  from?: number;
}

export interface ReadSpec { kind: string; [key: string]: unknown }

export interface ReadOutcome {

  total: number;

  kept: number | null;
}

interface Reading {
  label: string;
  read(dice: RolledDie[], spec: ReadSpec): ReadOutcome;
}

const sum: Reading = {
  label: 'сумма',
  read(dice) {
    const total = dice.reduce((acc, d) => acc + d.value, 0);
    return { total, kept: dice.length === 1 ? dice[0]!.value : null };
  },
};

const keeping = (best: boolean): Reading => ({
  label: best ? 'лучшая' : 'худшая',
  read(dice, spec) {
    const keep = Math.max(1, Number(spec.keep ?? 1));
    const taken = [...dice]
      .sort((a, b) => (best ? b.value - a.value : a.value - b.value))
      .slice(0, keep);
    const total = taken.reduce((acc, d) => acc + d.value, 0);
    return { total, kept: taken.length === 1 ? taken[0]!.value : null };
  },
});

const PER_DIE: Record<string, (value: number, versus: number) => boolean> = {
  atLeast: (v, n) => v >= n,
  notOver: (v, n) => v <= n,
  over: (v, n) => v > n,
  under: (v, n) => v < n,
};

const count: Reading = {
  label: 'счёт успехов',
  read(dice, spec) {
    const direction = Object.keys(PER_DIE).find(key => spec[key] !== undefined);
    if (!direction) {
      throw new EngineError(
        `чтению «счёт успехов» нужен порог на кость — одно из: ${Object.keys(PER_DIE).join(', ')}`);
    }
    const versus = Number(spec[direction]);
    const hit = PER_DIE[direction]!;
    return { total: dice.filter(d => hit(d.value, versus)).length, kept: null };
  },
};

const READINGS: Record<string, Reading> = {
  sum,
  best: keeping(true),
  worst: keeping(false),
  count,
};

export const readingKinds = () =>
  Object.entries(READINGS).map(([kind, r]) => ({ kind, label: r.label }));

export function readingOf(raw: unknown): ReadSpec {
  if (raw === undefined || raw === null || raw === '') return { kind: 'sum' };
  if (typeof raw === 'string') return { kind: raw };
  if (typeof raw === 'object' && 'kind' in raw) return raw as ReadSpec;
  throw new EngineError(
    `не понимаю чтение костей «${JSON.stringify(raw)}» — жду имя чтения или { kind, … }`);
}

export function applyReading(dice: RolledDie[], spec: ReadSpec): ReadOutcome {
  const reading = READINGS[spec.kind];
  if (!reading) {
    throw new EngineError(
      `неизвестное чтение костей «${spec.kind}»; есть: ${Object.keys(READINGS).join(', ')}`);
  }

  if (!dice.length) return { total: 0, kept: null };
  return reading.read(dice, spec);
}
