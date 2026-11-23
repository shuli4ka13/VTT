import { describe, it, expect } from 'vitest';
import { matchTagQuery, applyTag } from './tag-suggest.tsx';

describe('matchTagQuery', () => {
  it('ловит запрос за собакой, с пробелами в названии', () => {
    expect(matchTagQuery('1d20 + @бонус ат', 16)).toEqual({ at: 7, needle: 'бонус ат' });
  });

  it('без собаки запрос — слово перед кареткой, с первой буквы', () => {
    expect(matchTagQuery('1d20 + сил', 10)).toEqual({ at: 7, needle: 'сил' });
    expect(matchTagQuery('if(', 5)).toBeNull();
    expect(matchTagQuery('1d20 + 5', 8)).toBeNull();
  });

  it('не открывается на кости, внутри текста в кавычках и после точки или решётки', () => {
    expect(matchTagQuery('2к6', 3)).toBeNull();
    expect(matchTagQuery('к', 1)).toBeNull();
    expect(matchTagQuery('"сил', 4)).toBeNull();
    expect(matchTagQuery('@сила.сил', 9)).toBeNull();
    expect(matchTagQuery('#сил', 4)).toBeNull();
  });
});

describe('applyTag', () => {
  it('заменяет запрос тегом и ставит каретку за ним', () => {
    expect(applyTag('1d20 + @бонус ат', 7, 16, 'бонус_атаки'))
      .toEqual({ next: '1d20 + @бонус_атаки', caretTo: 19 });
  });
});
