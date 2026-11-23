import { group, test, eq, deepEq } from './harness.ts';
import { FUNCTION_NAMES } from '../src/formula/evaluate.ts';
import { FUNCTIONS, callAt } from '../src/formula/functions.ts';

const at = (before: string) => {
  const found = callAt(before);
  return found ? [found.spec.name, found.index] : null;
};

group('реестр функций', () => {
  test('описана каждая функция языка и ничего лишнего, плюс «если»', () => {
    deepEq(FUNCTIONS.map(one => one.name).filter(name => name !== 'if').sort(), [...FUNCTION_NAMES].filter(name => name !== 'roll').sort());
  });

  test('курсор внутри вызова: какая функция и какая её часть', () => {
    deepEq(at('if('), ['if', 0]);
    deepEq(at('if(@a > 1, '), ['if', 1]);
    deepEq(at('if(@a > 1, max(@b, '), ['max', 1]);
    deepEq(at('if(@a > 1, max(@b, 2), '), ['if', 2]);
    deepEq(at('table("урон", @x'), ['table', 1]);
    eq(at('@a + (1, 2'), null);
    eq(at('@a + 1'), null);
  });
});
