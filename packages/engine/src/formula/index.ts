import { parse } from './parse.ts';
import { dependencies } from './deps.ts';
import { evaluate } from './evaluate.ts';
import type { Node } from './ast.ts';
import type { Value } from './evaluate.ts';
import type { Resolve } from '../model/types.ts';

export { FormulaError, FormulaSyntaxError, FormulaRuntimeError } from './errors.ts';
export { FUNCTION_NAMES } from './evaluate.ts';
export { lex } from './lex.ts';
export type { Token, TokenType } from './lex.ts';
export type { Node } from './ast.ts';
export type { Value } from './evaluate.ts';

export interface Formula {
  readonly source: string;
  readonly ast: Node;
  readonly deps: readonly string[];
  evaluate(resolve: Resolve): Value;
}

const cache = new Map<string, Formula>();

export function compile(source: unknown): Formula {
  const key = String(source);
  const hit = cache.get(key);
  if (hit) return hit;

  const ast = parse(key);
  const formula: Formula = Object.freeze({
    source: key,
    ast,
    deps: Object.freeze(dependencies(ast)),
    evaluate: (resolve: Resolve) => evaluate(ast, resolve),
  });

  cache.set(key, formula);
  return formula;
}
