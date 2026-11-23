import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { compile, FormulaError, printFormula } from '../src/formula/index.ts';

group('интерфейс модуля формул', () => {
  test('compile возвращает дерево, зависимости и исходную строку', () => {
    const f = compile('floor((#str - 10) / 2)');
    eq(f.source, 'floor((#str - 10) / 2)');
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

group('запись кости: вычисление и печать', () => {
  test('кинуть(к4) узнаётся и отвечает, что кости бросает шаг «Бросок»', () => {
    const беда = throws(() => compile('roll(d4) + 1').evaluate(() => 0));
    ok(String(беда.message).includes('шаг «Бросок»'), String(беда.message));
  });

  test('голая кость в арифметике — ошибка вычисления, не тихий ноль', () => {
    throws(() => compile('d4 + 1').evaluate(() => 0), FormulaError);
  });

  test('печать хранит запись автора без кавычек', () => {
    eq(printFormula(compile('-roll(d4) + roll(2d6)').ast), '-roll(d4) + roll(2d6)');
    eq(printFormula(compile('roll("1d4")').ast), 'roll("1d4")');
  });
});
