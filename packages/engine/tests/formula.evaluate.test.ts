import { group, test, eq, throws } from './harness.ts';
import { parse } from '../src/formula/parse.ts';
import { evaluate } from '../src/formula/evaluate.ts';
import { FormulaRuntimeError } from '../src/formula/errors.ts';

const run = (src, values = {}) => evaluate(parse(src), tag => {
  if (!(tag in values)) throw new FormulaRuntimeError(`нет тега «${tag}»`);
  return values[tag];
});

group('интерпретатор', () => {
  group('арифметика', () => {
    test('число возвращает само себя', () => eq(run('42'), 42));
    test('сложение', () => eq(run('2 + 3'), 5));
    test('вычитание', () => eq(run('10 - 4'), 6));
    test('умножение', () => eq(run('6 * 7'), 42));
    test('деление не округляется само по себе', () => eq(run('7 / 2'), 3.5));
    test('приоритет соблюдается при вычислении', () => eq(run('2 + 3 * 4'), 14));
    test('унарный минус', () => eq(run('-(2 + 3)'), -5));
    test('деление на ноль — ошибка, а не Infinity', () => {
      throws(() => run('1 / 0'), FormulaRuntimeError, 'ноль');
    });
  });

  group('ссылки', () => {
    test('ссылка берёт значение через переданную функцию', () => {
      eq(run('#str', { str: 16 }), 16);
    });
    test('ссылка участвует в арифметике', () => {
      eq(run('#str + #dex', { str: 16, dex: 14 }), 30);
    });
    test('модификатор характеристики из 5e', () => {
      eq(run('округлить вниз((#str - 10) / 2)', { str: 16 }), 3);
      eq(run('округлить вниз((#str - 10) / 2)', { str: 7 }), -2);
    });
  });

  group('функции', () => {
    test('floor округляет вниз, в том числе отрицательные', () => {
      eq(run('округлить вниз(1.9)'), 1);
      eq(run('округлить вниз(-1.1)'), -2);
    });
    test('ceil округляет вверх', () => {
      eq(run('округлить вверх(1.1)'), 2);
      eq(run('округлить вверх(-1.9)'), -1);
    });
    test('round округляет по школьным правилам', () => {
      eq(run('округлить(1.4)'), 1);
      eq(run('округлить(1.5)'), 2);
    });
    test('abs убирает знак', () => {
      eq(run('модуль(-3)'), 3);
      eq(run('модуль(3)'), 3);
    });
    test('min и max принимают два аргумента', () => {
      eq(run('меньшее из(3, 5)'), 3);
      eq(run('большее из(3, 5)'), 5);
    });
    test('min и max принимают больше двух аргументов', () => {
      eq(run('меньшее из(4, 2, 9)'), 2);
      eq(run('большее из(4, 2, 9)'), 9);
    });
    test('неизвестная функция — внятная ошибка с именем', () => {
      throws(() => run('sqrt(4)'), FormulaRuntimeError, 'sqrt');
    });
    test('floor требует ровно один аргумент', () => {
      throws(() => run('округлить вниз(1, 2)'), FormulaRuntimeError);
      throws(() => run('округлить вниз()'), FormulaRuntimeError);
    });
  });

  group('сравнения и условия', () => {
    test('сравнение даёт логическое значение, а не число', () => {
      eq(run('2 < 3'), true);
      eq(run('2 > 3'), false);
      eq(run('2 <= 2'), true);
      eq(run('2 >= 3'), false);
      eq(run('2 == 2'), true);
      eq(run('2 != 2'), false);
    });
    test('«если» выбирает ветку', () => {
      eq(run('если(1 < 2, 10, 20)'), 10);
      eq(run('если(1 > 2, 10, 20)'), 20);
    });
    test('невыбранная ветка не вычисляется', () => {

      eq(run('если(1 < 2, 10, 1 / 0)'), 10);
    });
    test('логическое поле работает условием напрямую', () => {
      eq(run('если(@heavy, 0, @dex_mod)', { heavy: true, dex_mod: 2 }), 0);
      eq(run('если(@heavy, 0, @dex_mod)', { heavy: false, dex_mod: 2 }), 2);
    });
    test('число не является условием — числа и логика не смешиваются', () => {
      throws(() => run('если(1, 10, 20)'), FormulaRuntimeError, 'логическ');
    });
    test('арифметика с логическим значением — ошибка, а не тихое приведение к 1', () => {
      throws(() => run('#heavy + 1', { heavy: true }), FormulaRuntimeError);
    });
    test('класс брони: в тяжёлом доспехе Ловкость не прибавляется', () => {
      const expr = '@ac_base + если(@heavy, 0, @dex_mod)';
      eq(run(expr, { ac_base: 16, heavy: true, dex_mod: 3 }), 16);
      eq(run(expr, { ac_base: 12, heavy: false, dex_mod: 3 }), 15);
    });
  });
});

group('«все» и «любое» не считают лишнего', () => {
  const run = (src: string, x: number) => evaluate(parse(src), name => (name === 'x' ? x : 0));
  test('«все» останавливается на первом «нет»: предохранитель от деления на ноль', () => {
    eq(run('все(@x != 0, 10 / @x > 1)', 0), false);
    eq(run('все(@x != 0, 10 / @x > 1)', 5), true);
  });
  test('«любое» останавливается на первом «да»', () => {
    eq(run('любое(@x == 0, 10 / @x > 1)', 0), true);
    throws(() => run('любое(@x != 0, 10 / @x > 1)', 0), FormulaRuntimeError);
  });
});
