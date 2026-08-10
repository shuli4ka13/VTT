// Адаптер старого харнесса PoC на Vitest.
//
// Тесты переехали почти дословно: у них поменялись только пути импортов.
// Переписывать 505 проверок на `expect` вручную значило бы внести в перенос
// ровно тот класс ошибок, который перенос обязан исключить, — поэтому
// сохранены и имена, и семантика утверждений.
//
// Отличия семантики, которые важно не потерять:
//   deepEq   — сравнение через JSON.stringify, ЧУВСТВИТЕЛЬНО к порядку ключей
//              (так проверяются деревья разбора);
//   deepSame — структурное равенство БЕЗ учёта порядка (так проверяются данные).

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
  // Именно строковое сравнение: порядок ключей — часть проверки.
  expect(JSON.stringify(actual), note).toBe(JSON.stringify(expected));
}

export function deepSame(actual: unknown, expected: unknown, note?: string): void {
  expect(actual, note).toEqual(expected);
}

export function ok(value: unknown, note?: string): void {
  expect(value, note ?? `ожидалось истинное значение, получено ${show(value)}`).toBeTruthy();
}

type ErrorClass = new (...args: never[]) => Error;

/** Проверяет, что fn бросает. match — подстрока сообщения или класс ошибки. */
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
