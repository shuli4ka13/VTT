import { group, test, eq, throws } from './harness.ts';
import { parse } from '../src/formula/parse.ts';
import { printFormula } from '../src/formula/print.ts';
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
      eq(run('floor((#str - 10) / 2)', { str: 16 }), 3);
      eq(run('floor((#str - 10) / 2)', { str: 7 }), -2);
    });
  });

  group('функции', () => {
    test('floor округляет вниз, в том числе отрицательные', () => {
      eq(run('floor(1.9)'), 1);
      eq(run('floor(-1.1)'), -2);
    });
    test('ceil округляет вверх', () => {
      eq(run('ceil(1.1)'), 2);
      eq(run('ceil(-1.9)'), -1);
    });
    test('min и max принимают два аргумента', () => {
      eq(run('min(3, 5)'), 3);
      eq(run('max(3, 5)'), 5);
    });
    test('min и max принимают больше двух аргументов', () => {
      eq(run('min(4, 2, 9)'), 2);
      eq(run('max(4, 2, 9)'), 9);
    });
    test('неизвестная функция — внятная ошибка с именем', () => {
      throws(() => run('sqrt(4)'), FormulaRuntimeError, 'sqrt');
    });
    test('floor требует ровно один аргумент', () => {
      throws(() => run('floor(1, 2)'), FormulaRuntimeError);
      throws(() => run('floor()'), FormulaRuntimeError);
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
      eq(run('if(1 < 2, 10, 20)'), 10);
      eq(run('if(1 > 2, 10, 20)'), 20);
    });
    test('невыбранная ветка не вычисляется', () => {

      eq(run('if(1 < 2, 10, 1 / 0)'), 10);
    });
    test('логическое поле работает условием напрямую', () => {
      eq(run('if(@heavy, 0, @dex_mod)', { heavy: true, dex_mod: 2 }), 0);
      eq(run('if(@heavy, 0, @dex_mod)', { heavy: false, dex_mod: 2 }), 2);
    });
    test('число не является условием — числа и логика не смешиваются', () => {
      throws(() => run('if(1, 10, 20)'), FormulaRuntimeError, 'логическ');
    });
    test('арифметика с логическим значением — ошибка, а не тихое приведение к 1', () => {
      throws(() => run('#heavy + 1', { heavy: true }), FormulaRuntimeError);
    });
    test('класс брони: в тяжёлом доспехе Ловкость не прибавляется', () => {
      const expr = '@ac_base + if(@heavy, 0, @dex_mod)';
      eq(run(expr, { ac_base: 16, heavy: true, dex_mod: 3 }), 16);
      eq(run(expr, { ac_base: 12, heavy: false, dex_mod: 3 }), 15);
    });
  });
});

group('«все» и «любое» не считают лишнего', () => {
  const run = (src: string, x: number) => evaluate(parse(src), name => (name === 'x' ? x : 0));
  test('«все» останавливается на первом «нет»: предохранитель от деления на ноль', () => {
    eq(run('@x != 0 and 10 / @x > 1', 0), false);
    eq(run('@x != 0 and 10 / @x > 1', 5), true);
  });
  test('«любое» останавливается на первом «да»', () => {
    eq(run('@x == 0 or 10 / @x > 1', 0), true);
    throws(() => run('@x != 0 or 10 / @x > 1', 0), FormulaRuntimeError);
  });
});

group('«и», «или», «не» — операторы', () => {
  const env: Record<string, unknown> = { да_: true, нет_: false, ноль: 0, пусто_: null, пять: 5 };
  const run = (src: string) => evaluate(parse(src), name => env[name] as never);
  test('сравнения связывают сильнее, «и» сильнее «или», «не» — перед условием целиком', () => {
    eq(run('@пять > 1 and @пять < 10 or @нет_'), true);
    eq(run('not @пять == 5'), false);
    eq(run('(@да_ or @нет_) and not @нет_'), true);
  });
  test('«или» отдаёт первую заданную часть; ноль — значение, «нет» и пусто — нет', () => {
    eq(run('@пусто_ or 2'), 2);
    eq(run('@ноль or 2'), 0);
    eq(run('@нет_ or "запас"'), 'запас');
    eq(run('@пусто_ or @пусто_'), null);
  });
  test('«и», «или», «не» не на своём месте — ошибка разбора словами', () => {
    throws(() => parse('@пять == not @да_'));
    throws(() => parse('and @да_'));
    throws(() => parse('@да_ or'));
  });
  test('печать расставляет скобки по старшинству и разбирается обратно в то же', () => {
    for (const src of ['(@a or 0) + 1', '@a or @b and @c', '(@a or @b) and @c', 'not (@a and @b)', 'not @a == @b']) {
      eq(printFormula(parse(src)), src);
    }
  });
});

group('часть, пристёгнутая к знаку, берётся в скобки, если связывает слабее', () => {
  test('«или» в пороге и в сумме', async () => {
    const { operandText } = await import('../src/formula/logic.ts');
    eq(operandText('@порог or 0', '>='), '(@порог or 0)');
    eq(operandText('@порог or 0', '+'), '(@порог or 0)');
    eq(operandText('@a + 1', '>='), '@a + 1');
    eq(operandText('@a > 1', '+'), '(@a > 1)');
  });
});
