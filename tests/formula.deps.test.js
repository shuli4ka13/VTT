import { group, test, deepEq } from './harness.js';
import { parse } from '../src/formula/parse.js';
import { dependencies } from '../src/formula/deps.js';

const deps = src => dependencies(parse(src));

group('зависимости формулы', () => {
  test('формула без ссылок ни от чего не зависит', () => {
    deepEq(deps('1 + 2 * 3'), []);
  });

  test('ссылки собираются в порядке первого появления', () => {
    deepEq(deps('#str + #dex'), ['str', 'dex']);
  });

  test('повторная ссылка не дублируется', () => {
    deepEq(deps('#str + #str * 2'), ['str']);
  });

  test('ссылки внутри вызова функции видны', () => {
    deepEq(deps('floor((#str - 10) / 2)'), ['str']);
  });

  test('ссылки во всех трёх ветках тернарного оператора видны', () => {
    deepEq(deps('#heavy ? #ac_base : #ac_base + #dex_mod'), ['heavy', 'ac_base', 'dex_mod']);
  });

  test('ссылка под унарным минусом видна', () => {
    deepEq(deps('-#penalty'), ['penalty']);
  });

  test('ссылки в нескольких аргументах видны', () => {
    deepEq(deps('max(#a, min(#b, #c))'), ['a', 'b', 'c']);
  });
});
