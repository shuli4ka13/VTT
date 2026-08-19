import { describe, it, expect } from 'vitest';

export const group = describe;
export const test = it;

function show(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function eq(actual: unknown, expected: unknown, note?: string): void {
  expect(actual, note ?? `ожидалось ${show(expected)}, получено ${show(actual)}`).toBe(expected);
}

export function deepEq(actual: unknown, expected: unknown, note?: string): void {

  expect(JSON.stringify(actual), note).toBe(JSON.stringify(expected));
}

export function deepSame(actual: unknown, expected: unknown, note?: string): void {
  expect(actual, note).toEqual(expected);
}

export function ok(value: unknown, note?: string): void {
  expect(value, note ?? `ожидалось истинное значение, получено ${show(value)}`).toBeTruthy();
}

type ErrorClass = new (...args: never[]) => Error;

export function throws(fn: () => unknown, match?: string | ErrorClass, note?: string): Error {
  let thrown: unknown = null;
  try { fn(); } catch (err) { thrown = err; }

  expect(thrown, note ?? 'ожидалась ошибка, но её не было').not.toBe(null);

  if (typeof match === 'function') {
    expect(thrown, note ?? `ожидалась ошибка ${match.name}`).toBeInstanceOf(match);
  }
  if (typeof match === 'string') {
    expect(String((thrown as Error).message), note).toContain(match);
  }
  return thrown as Error;
}
