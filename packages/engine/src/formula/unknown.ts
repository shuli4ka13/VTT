export const UNKNOWN: unique symbol = Symbol('unknown');

export type Unknown = typeof UNKNOWN;

export const isUnknown = (value: unknown): value is Unknown => value === UNKNOWN;

export const hasUnknown = (value: unknown): boolean => value === UNKNOWN || (Array.isArray(value) && value.some(hasUnknown));
