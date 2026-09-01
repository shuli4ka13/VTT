import { describe, it, expect } from 'vitest';
import { matchTagQuery, applyTag } from './tag-suggest.tsx';

describe('matchTagQuery', () => {
  it('ловит запрос за собакой, с пробелами в названии', () => {
    expect(matchTagQuery('1d20 + @бонус ат', 16)).toEqual({ at: 7, needle: 'бонус ат' });
  });

  it('без собаки запроса нет — решётка тоже не считается', () => {
    expect(matchTagQuery('1d20 + 5', 8)).toBeNull();
    expect(matchTagQuery('#сил', 4)).toBeNull();
  });
});

describe('applyTag', () => {
  it('заменяет запрос тегом и ставит каретку за ним', () => {
    expect(applyTag('1d20 + @бонус ат', 7, 16, 'бонус_атаки'))
      .toEqual({ next: '1d20 + #бонус_атаки', caretTo: 19 });
  });
});
