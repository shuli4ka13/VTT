// Парсер: строка → AST. Рекурсивный спуск, по одному уровню приоритета на функцию.
//
// Грамматика (сверху вниз — от слабого связывания к сильному):
//
//   expression     := conditional
//   conditional    := comparison ( '?' conditional ':' conditional )?     правоассоциативен
//   comparison     := additive ( ('=='|'!='|'<'|'<='|'>'|'>=') additive )?  НЕ ассоциативен
//   additive       := multiplicative ( ('+'|'-') multiplicative )*         левоассоциативен
//   multiplicative := unary ( ('*'|'/') unary )*                           левоассоциативен
//   unary          := ('-'|'+') unary | primary
//   primary        := number | '#' tag | ident '(' args? ')' | '(' expression ')'
//   args           := expression ( ',' expression )*
//
// Парсер не знает, какие функции существуют и какие теги объявлены — это забота
// интерпретатора и движка. Здесь только форма.

import { lex } from './lex.js';
import { FormulaSyntaxError } from './errors.js';

const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>='];

export function parse(source) {
  const tokens = lex(source);
  let i = 0;

  const peek = () => tokens[i];
  const at = (type, value) => tokens[i].type === type && (value === undefined || tokens[i].value === value);
  const advance = () => tokens[i++];

  const ast = parseConditional();
  if (!at('eof')) throw new FormulaSyntaxError('лишний текст после конца выражения', peek().pos);
  return ast;

  function parseConditional() {
    const test = parseComparison();
    if (!at('question')) return test;
    advance();
    const then = parseConditional();
    if (!at('colon')) throw new FormulaSyntaxError('в тернарном операторе ожидается «:»', peek().pos);
    advance();
    return { kind: 'Conditional', test, then, otherwise: parseConditional() };
  }

  function parseComparison() {
    const left = parseAdditive();
    if (!(at('op') && COMPARISON_OPS.includes(peek().value))) return left;
    const op = advance().value;
    const right = parseAdditive();
    // `1 < 2 < 3` в математике и в языках программирования значит разное.
    // Вместо тихого выбора одного из смыслов — требуем скобки.
    if (at('op') && COMPARISON_OPS.includes(peek().value)) {
      throw new FormulaSyntaxError('сравнения не составляются в цепочку — расставьте скобки', peek().pos);
    }
    return { kind: 'Binary', op, left, right };
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (at('op', '+') || at('op', '-')) {
      const op = advance().value;
      left = { kind: 'Binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseUnary();
    while (at('op', '*') || at('op', '/')) {
      const op = advance().value;
      left = { kind: 'Binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (at('op', '-') || at('op', '+')) {
      const op = advance().value;
      return { kind: 'Unary', op, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();

    if (t.type === 'number') {
      advance();
      return { kind: 'Number', value: t.value };
    }

    if (t.type === 'ref') {
      advance();
      return { kind: 'Ref', tag: t.value };
    }

    if (t.type === 'ident') {
      advance();
      if (!at('lparen')) throw new FormulaSyntaxError(`после имени «${t.value}» ожидается «(»`, t.pos);
      advance();
      const args = [];
      if (!at('rparen')) {
        args.push(parseConditional());
        while (at('comma')) {
          advance();
          args.push(parseConditional());
        }
      }
      if (!at('rparen')) throw new FormulaSyntaxError('не закрыта скобка вызова функции', peek().pos);
      advance();
      return { kind: 'Call', name: t.value, args };
    }

    if (t.type === 'lparen') {
      advance();
      const inner = parseConditional();
      if (!at('rparen')) throw new FormulaSyntaxError('не закрыта скобка', peek().pos);
      advance();
      return inner;
    }

    if (t.type === 'eof') throw new FormulaSyntaxError('выражение оборвано', t.pos);
    throw new FormulaSyntaxError(`здесь не может стоять «${t.text}»`, t.pos);
  }
}
