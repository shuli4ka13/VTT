import { describe, it, expect } from 'vitest';
import { shapeProblem, type Shape } from './formula-shape.ts';

const named = (shapes: Record<string, Shape>) => (tag: string): Shape => shapes[tag] ?? 'any';

describe('вид формулы у входа', () => {
  it('слово плюс число — ошибка', () => {
    expect(shapeProblem('@тип + 1', 'choice', named({ тип: 'text' }))).toBe('слово нельзя складывать и умножать с числом');
  });
  it('колонка таблицы плюс число — число', () => {
    expect(shapeProblem('@способ.бонус + 1', 'number', named({ 'способ.бонус': 'number' }))).toBeNull();
  });
  it('вход ждёт число, а дали слово', () => {
    expect(shapeProblem('"огонь"', 'number', named({}))).toBe('нужно число, а здесь слово');
  });
  it('вход ждёт строку таблицы, а дали число', () => {
    expect(shapeProblem('2', 'choice', named({}))).toBe('нужно слово, а здесь число');
  });
  it('неизвестное имя и «если» не ругаются', () => {
    expect(shapeProblem('@x', 'number', named({}))).toBeNull();
    expect(shapeProblem('если(@x > 1, 2, 3)', 'number', named({}))).toBeNull();
  });
});
