import type { Control, FieldOption, StoredValue } from '@vtt/schema';

export interface ViewProps {
  value: unknown;
  label: string;
  min?: number;
  max?: number;
  options?: FieldOption[];
  control?: Omit<Control, 'kind'>;
  onChange?: (value: StoredValue) => void;
}

export const MOST_DOTS = 20;

export const clamp = (value: number, min?: number, max?: number): number => {
  const low = typeof min === 'number' ? Math.max(min, value) : value;
  return typeof max === 'number' ? Math.min(max, low) : low;
};

export const blank = (value: unknown): boolean => value === null || value === undefined || value === '';

export const numberOf = (value: unknown): number | null => {
  if (blank(value)) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export const signed = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : blank(value) ? [] : [value];

export const same = (a: unknown, b: unknown): boolean => String(a) === String(b);

export const labelOf = (options: FieldOption[] | undefined, value: unknown): string =>
  options?.find(option => same(option.value, value))?.label ?? String(value ?? '');

export const shareOf = (now: number, min: number, max: number): number =>
  (max > min ? Math.max(0, Math.min(1, (now - min) / (max - min))) : 0);

export const toneOf = (share: number, worse: 'low' | 'high' = 'low'): 'ok' | 'warn' | 'danger' => {
  const bad = worse === 'low' ? 1 - share : share;
  return bad >= 0.75 ? 'danger' : bad >= 0.5 ? 'warn' : 'ok';
};

export const roundTo = (value: number, step: number, min = 0): number =>
  Math.round((value - min) / step) * step + min;
