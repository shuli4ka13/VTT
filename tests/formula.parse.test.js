import { group, test, eq, deepEq, throws } from './harness.js';
import { parse } from '../src/formula/parse.js';
import { FormulaSyntaxError } from '../src/formula/errors.js';

// Скобочный вид дерева — читать проще, чем сырой JSON.
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
    eq(sexp(parse('floor(1.5)')), '(floor 1.5)');
  });

  test('вызов функции с двумя аргументами', () => {
    eq(sexp(parse('max(1, 2)')), '(max 1 2)');
  });

  test('вложенные вызовы', () => {
    eq(sexp(parse('floor(min(#str, 20) / 2)')), '(floor (/ (min #str 20) 2))');
  });

  test('сравнение слабее сложения', () => {
    eq(sexp(parse('1 + 2 < 4')), '(< (+ 1 2) 4)');
  });

  test('тернарный оператор', () => {
    eq(sexp(parse('#heavy ? 0 : #dex_mod')), '(if #heavy 0 #dex_mod)');
  });

  test('тернарный слабее сравнения', () => {
    eq(sexp(parse('#lvl >= 5 ? 3 : 2')), '(if (>= #lvl 5) 3 2)');
  });

  test('тернарный правоассоциативен', () => {
    eq(sexp(parse('1 ? 2 : 3 ? 4 : 5')), '(if 1 2 (if 3 4 5))');
  });

  test('формула модификатора из 5e разбирается целиком', () => {
    eq(sexp(parse('floor((#str - 10) / 2)')), '(floor (/ (- #str 10) 2))');
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

    test('тернарный без ветки else', () => {
      throws(() => parse('1 ? 2'), FormulaSyntaxError);
    });

    test('пустой аргумент в вызове', () => {
      throws(() => parse('max(1, )'), FormulaSyntaxError);
    });

    test('цепочка сравнений запрещена — она читается неоднозначно', () => {
      throws(() => parse('1 < 2 < 3'), FormulaSyntaxError, 'цепочк');
    });
  });
});
