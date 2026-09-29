import { group, test, eq, deepEq, throws } from './harness.ts';
import { parse } from '../src/formula/parse.ts';
import { FormulaSyntaxError } from '../src/formula/errors.ts';

function sexp(node) {
  switch (node.kind) {
    case 'Number': return String(node.value);
    case 'Ref': return '#' + node.tag;
    case 'Unary': return `(${node.op} ${sexp(node.operand)})`;
    case 'Binary': return `(${node.op} ${sexp(node.left)} ${sexp(node.right)})`;
    case 'Call': return `(${node.name} ${node.args.map(sexp).join(' ')})`;
    case 'Conditional': return `(if ${sexp(node.test)} ${sexp(node.then)} ${sexp(node.otherwise)})`;
    default: return `?${node.kind}`;
  }
}

group('парсер', () => {
  test('число становится листом Number', () => {
    deepEq(parse('42'), { kind: 'Number', value: 42 });
  });

  test('ссылка становится листом Ref и хранит тег без решётки', () => {
    deepEq(parse('#str_mod'), { kind: 'Ref', tag: 'str_mod' });
  });

  test('умножение связывает крепче сложения', () => {
    eq(sexp(parse('1 + 2 * 3')), '(+ 1 (* 2 3))');
  });

  test('деление связывает крепче вычитания', () => {
    eq(sexp(parse('10 - 6 / 3')), '(- 10 (/ 6 3))');
  });

  test('вычитание левоассоциативно', () => {
    eq(sexp(parse('1 - 2 - 3')), '(- (- 1 2) 3)');
  });

  test('скобки перебивают приоритет', () => {
    eq(sexp(parse('(1 + 2) * 3')), '(* (+ 1 2) 3)');
  });

  test('унарный минус', () => {
    eq(sexp(parse('-5')), '(- 5)');
    eq(sexp(parse('-#str')), '(- #str)');
  });

  test('унарный минус связывает крепче умножения', () => {
    eq(sexp(parse('-2 * 3')), '(* (- 2) 3)');
  });

  test('унарный плюс тоже допустим', () => {
    eq(sexp(parse('+5')), '(+ 5)');
  });

  test('вызов функции с одним аргументом', () => {
    eq(sexp(parse('округлить вниз(1.5)')), '(округлить вниз 1.5)');
  });

  test('вызов функции с двумя аргументами', () => {
    eq(sexp(parse('большее из(1, 2)')), '(большее из 1 2)');
  });

  test('вложенные вызовы', () => {
    eq(sexp(parse('округлить вниз(меньшее из(#str, 20) / 2)')), '(округлить вниз (/ (меньшее из #str 20) 2))');
  });

  test('сравнение слабее сложения', () => {
    eq(sexp(parse('1 + 2 < 4')), '(< (+ 1 2) 4)');
  });

  test('«если» выбирает из двух', () => {
    eq(sexp(parse('если(@heavy, 0, @dex_mod)')), '(if #heavy 0 #dex_mod)');
  });

  test('условие «если» — любое сравнение', () => {
    eq(sexp(parse('если(@lvl >= 5, 3, 2)')), '(if (>= #lvl 5) 3 2)');
  });

  test('«если» вкладывается', () => {
    eq(sexp(parse('если(1, 2, если(3, 4, 5))')), '(if 1 2 (if 3 4 5))');
  });

  test('формула модификатора из 5e разбирается целиком', () => {
    eq(sexp(parse('округлить вниз((#str - 10) / 2)')), '(округлить вниз (/ (- #str 10) 2))');
  });

  group('ошибки', () => {
    test('пустая формула', () => {
      throws(() => parse(''), FormulaSyntaxError);
      throws(() => parse('   '), FormulaSyntaxError);
    });

    test('оборванное выражение', () => {
      throws(() => parse('1 +'), FormulaSyntaxError);
    });

    test('незакрытая скобка', () => {
      throws(() => parse('(1 + 2'), FormulaSyntaxError, 'скобк');
    });

    test('лишний мусор в конце', () => {
      const err = throws(() => parse('1 2'), FormulaSyntaxError);
      eq(err.pos, 2);
    });

    test('«если» без ветки «иначе»', () => {
      throws(() => parse('если(1, 2)'), FormulaSyntaxError, 'три части');
    });

    test('пустой аргумент в вызове', () => {
      throws(() => parse('большее из(1, )'), FormulaSyntaxError);
    });

    test('цепочка сравнений запрещена — она читается неоднозначно', () => {
      throws(() => parse('1 < 2 < 3'), FormulaSyntaxError, 'цепочк');
    });
  });
});
