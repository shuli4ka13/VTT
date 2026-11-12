import { group, test, eq, deepEq } from './harness.ts';
import { FUNCTION_NAMES } from '../src/formula/evaluate.ts';
import { FUNCTIONS, callAt } from '../src/formula/functions.ts';

const at = (before: string) => {
  const found = callAt(before);
  return found ? [found.spec.name, found.index] : null;
};

group('реестр функций', () => {
  test('описана каждая функция языка и ничего лишнего, плюс «если»', () => {
    deepEq(FUNCTIONS.map(one => one.name).filter(name => name !== 'если').sort(), [...FUNCTION_NAMES].filter(name => name !== 'кинуть').sort());
  });

  test('курсор внутри вызова: какая функция и какая её часть', () => {
    deepEq(at('если('), ['если', 0]);
    deepEq(at('если(@a > 1, '), ['если', 1]);
    deepEq(at('если(@a > 1, большее из(@b, '), ['большее из', 1]);
    deepEq(at('если(@a > 1, большее из(@b, 2), '), ['если', 2]);
    deepEq(at('таблица("урон", @x'), ['таблица', 1]);
    eq(at('@a + (1, 2'), null);
    eq(at('@a + 1'), null);
  });
});
