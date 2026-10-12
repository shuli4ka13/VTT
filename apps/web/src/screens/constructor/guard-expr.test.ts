import { describe, it, expect } from 'vitest';
import { splitHolder, joinHolder, holderIn } from './guard-expr.ts';

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

  it('склейка ничего не теряет: сохранённое «лист и источник — носитель» переживает правку соседнего условия', () => {
    expect(joinHolder('@лист == @носитель', 'все(@источник == @носитель, @x)')).toBe('все(@лист == @носитель, @источник == @носитель, @x)');
  });

  it('своё «… == носитель» во вписанном условии узнаётся — тогда поле не приклеивает выбранное', () => {
    expect(holderIn('все(@источник == @носитель, @a)', holders)).toBe(true);
    expect(holderIn('@лист==@носитель', holders)).toBe(true);
    expect(holderIn('@a', holders)).toBe(false);
    expect(holderIn('@носитель.hp > 0', holders)).toBe(false);
    expect(holderIn('кинуть(', holders)).toBe(false);
  });
});
