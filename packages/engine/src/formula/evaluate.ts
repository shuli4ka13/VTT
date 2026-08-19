import { FormulaRuntimeError } from './errors.ts';
import type { Node, BinaryNode, CallNode } from './ast.ts';
import type { Resolve } from '../model/types.ts';

export type Value = number | boolean;

interface Fn { arity: number | '1+'; apply: (args: number[]) => number }

const FUNCTIONS: Record<string, Fn> = {
  floor: { arity: 1, apply: args => Math.floor(args[0]!) },
  ceil: { arity: 1, apply: args => Math.ceil(args[0]!) },
  min: { arity: '1+', apply: args => Math.min(...args) },
  max: { arity: '1+', apply: args => Math.max(...args) },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

export function evaluate(ast: Node, resolve: Resolve): Value {
  return visit(ast);

  function visit(node: Node): Value {
    switch (node.kind) {
      case 'Number':
        return node.value;

      case 'Ref':

        return resolve(node.tag) as Value;

      case 'Unary': {
        const value = number(visit(node.operand), `операнд «${node.op}»`);
        return node.op === '-' ? -value : value;
      }

      case 'Binary':
        return binary(node);

      case 'Call':
        return call(node);

      case 'Conditional':

        return boolean(visit(node.test), 'условие тернарного оператора')
          ? visit(node.then)
          : visit(node.otherwise);

      default:
        throw new FormulaRuntimeError(`неизвестный узел дерева: ${(node as Node).kind}`);
    }
  }

  function binary(node: BinaryNode): Value {
    const left = visit(node.left);
    const right = visit(node.right);

    if (node.op === '==') return left === right;
    if (node.op === '!=') return left !== right;

    const a = number(left, `левый операнд «${node.op}»`);
    const b = number(right, `правый операнд «${node.op}»`);

    switch (node.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new FormulaRuntimeError('деление на ноль');
        return a / b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default:
        throw new FormulaRuntimeError(`неизвестный оператор «${node.op}»`);
    }
  }

  function call(node: CallNode): Value {
    const fn = FUNCTIONS[node.name];
    if (!fn) {
      throw new FormulaRuntimeError(
        `нет функции «${node.name}»; доступны: ${FUNCTION_NAMES.join(', ')}`);
    }
    if (fn.arity === '1+' && node.args.length < 1) {
      throw new FormulaRuntimeError(`«${node.name}» требует хотя бы один аргумент`);
    }
    if (typeof fn.arity === 'number' && node.args.length !== fn.arity) {
      throw new FormulaRuntimeError(
        `«${node.name}» требует аргументов: ${fn.arity}, передано ${node.args.length}`);
    }
    const args = node.args.map((arg, n) => number(visit(arg), `аргумент ${n + 1} функции «${node.name}»`));
    return fn.apply(args);
  }
}

function number(value: unknown, what: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new FormulaRuntimeError(`${what} должен быть числом, получено ${describe(value)}`);
  }
  return value;
}

function boolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FormulaRuntimeError(`${what} должно быть логическим, получено ${describe(value)}`);
  }
  return value;
}

function describe(value: unknown): string {
  if (typeof value === 'boolean') return `логическое ${value}`;
  if (typeof value === 'number') return `число ${value}`;
  if (value === undefined) return 'ничего';
  return `${typeof value} ${JSON.stringify(value)}`;
}
