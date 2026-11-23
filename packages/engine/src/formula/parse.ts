import { lex } from './lex.ts';
import type { Token, TokenType } from './lex.ts';
import type { Node } from './ast.ts';
import { FormulaSyntaxError } from './errors.ts';
import { NEUTRAL_WORDS } from './words.ts';
import { tr, live } from '../words/tongue.ts';

export const BOOLEANS: Record<string, boolean> = { true: true, false: false };

const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>='];

export const AND = 'and';
export const OR = 'or';
export const NOT = 'not';
export const IF = 'if';

const MISPLACED: Record<string, string> = live({
  [AND]: '«и» ставится между двумя условиями: а и б',
  [OR]: '«или» ставится между двумя частями: а или б',
  [NOT]: '«не» ставится перед условием целиком: не а',
});

export function parse(source: unknown): Node {
  const tokens = lex(source, NEUTRAL_WORDS);
  let i = 0;

  const peek = (): Token => tokens[i]!;
  const at = (type: TokenType, value?: string) =>
    peek().type === type && (value === undefined || peek().value === value);
  const advance = (): Token => tokens[i++]!;

  const ast = parseOr();
  if (!at('eof')) throw new FormulaSyntaxError(tr`лишний текст после конца выражения`, peek().pos);
  return ast;

  function parseOr(): Node {
    let left = parseAnd();
    while (at('ident', OR)) {
      advance();
      left = { kind: 'Binary', op: OR, left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): Node {
    let left = parseNot();
    while (at('ident', AND)) {
      advance();
      left = { kind: 'Binary', op: AND, left, right: parseNot() };
    }
    return left;
  }

  function parseNot(): Node {
    if (at('ident', NOT)) {
      advance();
      return { kind: 'Unary', op: NOT, operand: parseNot() };
    }
    return parseComparison();
  }

  function parseComparison(): Node {
    const left = parseAdditive();
    if (!(at('op') && COMPARISON_OPS.includes(String(peek().value)))) return left;
    const op = String(advance().value);
    const right = parseAdditive();

    if (at('op') && COMPARISON_OPS.includes(String(peek().value))) {
      throw new FormulaSyntaxError(tr`сравнения не составляются в цепочку — расставьте скобки`, peek().pos);
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
      if (at('rbracket')) throw new FormulaSyntaxError(tr`в «[ ]» впишите, по какому значению взять колонку`, open.pos);
      const key = parseOr();
      if (!at('rbracket')) throw new FormulaSyntaxError(tr`не закрыта «[»`, peek().pos);
      advance();
      if (!at('tail')) return { kind: 'Pick', tag: String(t.value), key };
      return { kind: 'Pick', tag: String(t.value), key, rest: String(advance().value) };
    }

    if (t.type === 'ident') {
      const misplaced = MISPLACED[String(t.value)];
      if (misplaced) throw new FormulaSyntaxError(misplaced, t.pos);
      advance();
      if (!at('lparen') && String(t.value) in BOOLEANS) return { kind: 'Bool', value: BOOLEANS[String(t.value)]! };
      if (!at('lparen')) throw new FormulaSyntaxError(tr`после имени «${t.value}» ожидается «(»`, t.pos);
      advance();
      const args: Node[] = [];
      if (!at('rparen')) {
        args.push(parseOr());
        while (at('comma')) {
          advance();
          args.push(parseOr());
        }
      }
      if (!at('rparen')) throw new FormulaSyntaxError(tr`не закрыта скобка вызова функции`, peek().pos);
      advance();
      if (t.value === IF) {
        if (args.length !== 3) throw new FormulaSyntaxError(tr`«если» ждёт три части: условие, что если да, что если нет`, t.pos);
        return { kind: 'Conditional', test: args[0]!, then: args[1]!, otherwise: args[2]! };
      }
      return { kind: 'Call', name: String(t.value), args };
    }

    if (t.type === 'lparen') {
      advance();
      const inner = parseOr();
      if (!at('rparen')) throw new FormulaSyntaxError(tr`не закрыта скобка`, peek().pos);
      advance();
      return inner;
    }

    if (t.type === 'eof') throw new FormulaSyntaxError(tr`выражение оборвано`, t.pos);
    throw new FormulaSyntaxError(tr`здесь не может стоять «${t.text}»`, t.pos);
  }
}
