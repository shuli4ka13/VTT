import { lex } from './lex.ts';
import type { Token, TokenType } from './lex.ts';
import type { Node } from './ast.ts';
import { FormulaSyntaxError } from './errors.ts';

const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>='];

export function parse(source: unknown): Node {
  const tokens = lex(source);
  let i = 0;

  const peek = (): Token => tokens[i]!;
  const at = (type: TokenType, value?: string) =>
    peek().type === type && (value === undefined || peek().value === value);
  const advance = (): Token => tokens[i++]!;

  const ast = parseConditional();
  if (!at('eof')) throw new FormulaSyntaxError('лишний текст после конца выражения', peek().pos);
  return ast;

  function parseConditional(): Node {
    const test = parseComparison();
    if (!at('question')) return test;
    advance();
    const then = parseConditional();
    if (!at('colon')) throw new FormulaSyntaxError('в тернарном операторе ожидается «:»', peek().pos);
    advance();
    return { kind: 'Conditional', test, then, otherwise: parseConditional() };
  }

  function parseComparison(): Node {
    const left = parseAdditive();
    if (!(at('op') && COMPARISON_OPS.includes(String(peek().value)))) return left;
    const op = String(advance().value);
    const right = parseAdditive();

    if (at('op') && COMPARISON_OPS.includes(String(peek().value))) {
      throw new FormulaSyntaxError('сравнения не составляются в цепочку — расставьте скобки', peek().pos);
    }
    return { kind: 'Binary', op, left, right };
  }

  function parseAdditive(): Node {
    let left = parseMultiplicative();
    while (at('op', '+') || at('op', '-')) {
      const op = String(advance().value);
      left = { kind: 'Binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative(): Node {
    let left = parseUnary();
    while (at('op', '*') || at('op', '/')) {
      const op = String(advance().value);
      left = { kind: 'Binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): Node {
    if (at('op', '-') || at('op', '+')) {
      const op = String(advance().value);
      return { kind: 'Unary', op, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const t = peek();

    if (t.type === 'number') {
      advance();
      return { kind: 'Number', value: Number(t.value) };
    }

    if (t.type === 'text') {
      advance();
      return { kind: 'Text', value: String(t.value) };
    }

    if (t.type === 'ref') {
      advance();
      return { kind: 'Ref', tag: String(t.value) };
    }

    if (t.type === 'ident') {
      advance();
      if (!at('lparen')) throw new FormulaSyntaxError(`после имени «${t.value}» ожидается «(»`, t.pos);
      advance();
      const args: Node[] = [];
      if (!at('rparen')) {
        args.push(parseConditional());
        while (at('comma')) {
          advance();
          args.push(parseConditional());
        }
      }
      if (!at('rparen')) throw new FormulaSyntaxError('не закрыта скобка вызова функции', peek().pos);
      advance();
      return { kind: 'Call', name: String(t.value), args };
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
