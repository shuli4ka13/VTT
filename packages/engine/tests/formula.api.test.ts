import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { compile, FormulaError } from '../src/formula/index.ts';

group('интерфейс модуля формул', () => {
  test('compile возвращает дерево, зависимости и исходную строку', () => {
    const f = compile('округлить вниз((#str - 10) / 2)');
    eq(f.source, 'округлить вниз((#str - 10) / 2)');
    deepEq(f.deps, ['str']);
    eq(f.ast.kind, 'Call');
  });

  test('повторный compile той же строки отдаёт то же дерево без пересборки', () => {
    const a = compile('#str + 1');
    const b = compile('#str + 1');
    ok(a === b, 'ожидался тот же объект из кэша');
  });

  test('разные строки дают разные деревья', () => {
    ok(compile('#str + 1') !== compile('#str + 2'));
  });

  test('битая формула бросает FormulaError уже на compile', () => {
    throws(() => compile('1 +'), FormulaError);
  });

  test('вычисление идёт через compile без повторного разбора', () => {
    const f = compile('#a * 2');
    eq(f.evaluate(tag => ({ a: 21 })[tag]), 42);
  });
});
