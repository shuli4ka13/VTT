import { describe, it, expect } from 'vitest';
import { splitHolder, joinHolder } from './guard-expr.ts';

describe('«Касается» отделяется по дереву формулы', () => {
  const holders = ['@лист == @носитель', '@источник == @носитель'];

  it('запятые внутри вызовов не режут условие', () => {
    const { holder, rest } = splitHolder('все(@лист == @носитель, сколько(@итоги.x, да) >= 1)', holders);
    expect(holder).toBe('@лист == @носитель');
    expect(rest).toBe('сколько(@итоги.x, да) >= 1');
  });

  it('носитель не первым — тоже находится; остальное остаётся одним «все»', () => {
    const { holder, rest } = splitHolder('все(не(пусто(@источник)), @лист == @носитель, @источник != @носитель)', holders);
    expect(holder).toBe('@лист == @носитель');
    expect(rest).toBe('все(не(пусто(@источник)), @источник != @носитель)');
  });

  it('склейка разворачивает «все» остатка — без вложенных все(все(…))', () => {
    expect(joinHolder('@лист == @носитель', 'все(@a, @b)')).toBe('все(@лист == @носитель, @a, @b)');
    expect(joinHolder('', '@a')).toBe('@a');
    expect(joinHolder('@лист == @носитель', '')).toBe('@лист == @носитель');
    expect(joinHolder('', '')).toBeNull();
  });
});
