import type { FieldOption, StoredValue } from '@vtt/schema';

export interface ViewProps {
  value: unknown;
  label: string;
  min?: number;
  max?: number;
  options?: FieldOption[];
  onChange?: (value: StoredValue) => void;
}

export const clamp = (value: number, min?: number, max?: number): number => {
  const low = typeof min === 'number' ? Math.max(min, value) : value;
  return typeof max === 'number' ? Math.min(max, low) : low;
};

export const numberOf = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'boolean' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const signed = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];

export const same = (a: unknown, b: unknown): boolean => String(a) === String(b);

export const labelOf = (options: FieldOption[] | undefined, value: unknown): string =>
  options?.find(option => same(option.value, value))?.label ?? String(value ?? '');

export const slotsOf = (max: number | undefined, value: number, fallback = 5): number =>
  Math.max(0, Math.min(20, Math.round(typeof max === 'number' ? max : Math.max(value, fallback))));

export const shareOf = (now: number, min = 0, max?: number): number => {
  const top = typeof max === 'number' && max > min ? max : Math.max(now, min + 1);
  return Math.max(0, Math.min(1, (now - min) / (top - min)));
};

export const toneOf = (share: number): 'ok' | 'warn' | 'danger' =>
  share <= 0.25 ? 'danger' : share <= 0.5 ? 'warn' : 'ok';
