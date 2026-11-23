import { describe, it, expect } from 'vitest';
import { splitHolder, joinHolder, holderIn } from './guard-expr.ts';

describe('«Касается» отделяется по дереву формулы', () => {
  const holders = ['@sheet == @holder', '@источник == @holder'];

  it('запятые внутри вызовов не режут условие', () => {
    const { holder, rest } = splitHolder('@sheet == @holder and count(@results.x, true) >= 1', holders);
    expect(holder).toBe('@sheet == @holder');
    expect(rest).toBe('count(@results.x, true) >= 1');
  });

  it('носитель не первым — тоже находится; остальное остаётся одним «все»', () => {
    const { holder, rest } = splitHolder('not empty(@источник) and @sheet == @holder and @источник != @holder', holders);
    expect(holder).toBe('@sheet == @holder');
    expect(rest).toBe('not empty(@источник) and @источник != @holder');
  });

  it('склейка разворачивает «все» остатка — без вложенных все(все(…))', () => {
    expect(joinHolder('@sheet == @holder', '@a and @b')).toBe('@sheet == @holder and @a and @b');
    expect(joinHolder('', '@a')).toBe('@a');
    expect(joinHolder('@sheet == @holder', '')).toBe('@sheet == @holder');
    expect(joinHolder('', '')).toBeNull();
  });

  it('склейка ничего не теряет: сохранённое «лист и источник — носитель» переживает правку соседнего условия', () => {
    expect(joinHolder('@sheet == @holder', '@источник == @holder and @x')).toBe('@sheet == @holder and @источник == @holder and @x');
  });

  it('своё «… == носитель» во вписанном условии узнаётся — тогда поле не приклеивает выбранное', () => {
    expect(holderIn('@источник == @holder and @a', holders)).toBe(true);
    expect(holderIn('@sheet==@holder', holders)).toBe(true);
    expect(holderIn('@a', holders)).toBe(false);
    expect(holderIn('@holder.hp > 0', holders)).toBe(false);
    expect(holderIn('округлить(', holders)).toBe(false);
  });
});
