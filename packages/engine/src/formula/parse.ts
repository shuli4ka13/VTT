import { lex } from './lex.ts';
import type { Token, TokenType } from './lex.ts';
import type { Node } from './ast.ts';
import { FormulaSyntaxError } from './errors.ts';

export const BOOLEANS: Record<string, boolean> = { да: true, нет: false };

const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>='];

export function parse(source: unknown): Node {
  const tokens = lex(source);
  let i = 0;

  const peek = (): Token => tokens[i]!;
  const at = (type: TokenType, value?: string) =>
    peek().type === type && (value === undefined || peek().value === value);
  const advance = (): Token => tokens[i++]!;

  const ast = parseComparison();
  if (!at('eof')) throw new FormulaSyntaxError('лишний текст после конца выражения', peek().pos);
  return ast;

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
      return { kind: 'Text', value: String(t.value), at: t.pos, raw: t.text, ...(t.dice ? { dice: true as const } : {}) };
    }

    if (t.type === 'ref') {
      advance();
      if (!at('lbracket')) return { kind: 'Ref', tag: String(t.value) };
      const open = advance();
      if (at('rbracket')) throw new FormulaSyntaxError('в «[ ]» впишите, по какому значению взять колонку', open.pos);
      const key = parseComparison();
      if (!at('rbracket')) throw new FormulaSyntaxError('не закрыта «[»', peek().pos);
      advance();
      if (!at('tail')) return { kind: 'Pick', tag: String(t.value), key };
      return { kind: 'Pick', tag: String(t.value), key, rest: String(advance().value) };
    }

    if (t.type === 'ident') {
      advance();
      if (!at('lparen') && String(t.value) in BOOLEANS) return { kind: 'Bool', value: BOOLEANS[String(t.value)]! };
      if (!at('lparen')) throw new FormulaSyntaxError(`после имени «${t.value}» ожидается «(»`, t.pos);
      advance();
      const args: Node[] = [];
      if (!at('rparen')) {
        args.push(parseComparison());
        while (at('comma')) {
          advance();
          args.push(parseComparison());
        }
      }
      if (!at('rparen')) throw new FormulaSyntaxError('не закрыта скобка вызова функции', peek().pos);
      advance();
      if (t.value === 'если') {
        if (args.length !== 3) throw new FormulaSyntaxError('«если» ждёт три части: условие, что если да, что если нет', t.pos);
        return { kind: 'Conditional', test: args[0]!, then: args[1]!, otherwise: args[2]! };
      }
      return { kind: 'Call', name: String(t.value), args };
    }

    if (t.type === 'lparen') {
      advance();
      const inner = parseComparison();
      if (!at('rparen')) throw new FormulaSyntaxError('не закрыта скобка', peek().pos);
      advance();
      return inner;
    }

    if (t.type === 'eof') throw new FormulaSyntaxError('выражение оборвано', t.pos);
    throw new FormulaSyntaxError(`здесь не может стоять «${t.text}»`, t.pos);
  }
}
