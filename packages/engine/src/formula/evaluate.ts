import { FormulaRuntimeError } from './errors.ts';
import { AND, OR, NOT } from './parse.ts';
import { diceByStep } from '../words/glossary.ts';
import { RU_WORDS } from './words.ts';

const saidName = (name: string): string => (RU_WORDS.functions as Record<string, string>)[name] ?? name;
import type { Node, BinaryNode, CallNode } from './ast.ts';
import type { Resolve } from '../model/types.ts';
import { tr } from '../words/tongue.ts';
import { UNKNOWN, hasUnknown } from './unknown.ts';

export type Value = number | boolean | string;

export interface Tools {
  peak?: (notation: string, times: number) => number;
  table?: (name: string, key: Value | Value[], column: string | null) => Value;
  rows?: (table: string, column: string, host?: string) => Value[];
}

interface Fn {
  arity: number | '1+';
  apply: (args: number[]) => number;
  raw?: (args: Value[], tools: Tools) => Value;
}

const FUNCTIONS: Record<string, Fn> = {
  floor: { arity: 1, apply: args => Math.floor(args[0]!) },
  ceil: { arity: 1, apply: args => Math.ceil(args[0]!) },
  min: { arity: '1+', apply: () => 0, raw: args => Math.min(...numbers(args, tr`меньшее из`)) },
  max: { arity: '1+', apply: () => 0, raw: args => Math.max(...numbers(args, tr`большее из`)) },
  sum: { arity: '1+', apply: () => 0, raw: args => numbers(args, tr`сумма`, true).reduce((sum, value) => sum + value, 0) },
  count: {
    arity: '1+',
    apply: () => 0,
    raw: args => {
      if (args.length > 2) throw new FormulaRuntimeError(tr`«сколько» ждёт список и, если нужно, какое значение считать`);
      const list = listOf(args[0]).filter(value => value !== null && value !== undefined && value !== '');
      return args.length === 2 ? list.filter(value => String(value) === String(args[1])).length : list.length;
    },
  },
  rows: {
    arity: '1+',
    apply: () => 0,
    raw: (args, tools) => {
      if (args.length < 2 || args.length > 3) throw new FormulaRuntimeError(tr`«строки» ждёт таблицу, колонку и, если нужно, вещь-хозяина`);
      if (!tools.rows) throw new FormulaRuntimeError(tr`«строки» здесь нельзя: таблиц системы тут не видно`);
      return tools.rows(String(args[0]), String(args[1]), args.length === 3 ? String(args[2] ?? '') : undefined) as unknown as Value;
    },
  },
  has: {
    arity: 2,
    apply: () => 0,
    raw: args => {
      const list = args[0] as unknown;
      const wanted = String(args[1]);
      return Array.isArray(list) ? list.some(item => String(item) === wanted) : String(list) === wanted;
    },
  },
  first: {
    arity: 1,
    apply: () => 0,
    raw: args => {
      const list = listOf(args[0]).filter(value => value !== null && value !== undefined && value !== '');
      return (list[0] ?? null) as Value;
    },
  },
  known: { arity: 1, apply: () => 0, raw: args => !hasUnknown(args[0]) },
  empty: {
    arity: 1,
    apply: () => 0,
    raw: args => args[0] === null || args[0] === undefined || args[0] === '' || (Array.isArray(args[0]) && !(args[0] as unknown[]).length),
  },
  table: {
    arity: '1+',
    apply: () => 0,
    raw: (args, tools) => {
      if (args.length < 2 || args.length > 3) {
        throw new FormulaRuntimeError(tr`«таблица» требует два или три аргумента: какая таблица, по чему искать и, если нужно, какая колонка`);
      }
      if (!tools.table) throw new FormulaRuntimeError(tr`«таблица» здесь нельзя: таблиц системы тут не видно`);
      return tools.table(String(args[0]), args[1] as Value, args.length > 2 ? String(args[2]) : null);
    },
  },
  die: {
    arity: '1+',
    apply: () => 0,
    raw: args => {
      if (args.length > 2) throw new FormulaRuntimeError(tr`«кость» ждёт число граней и, если нужно, сколько костей`);
      const sides = Number(args[0]);
      const count = args.length > 1 ? Number(args[1]) : 1;
      if (!Number.isInteger(sides) || sides < 1) throw new FormulaRuntimeError(tr`«кость»: граней должно быть целое число от 1, получено ${String(args[0])}`);
      if (!Number.isInteger(count) || count < 1) throw new FormulaRuntimeError(tr`«кость»: костей должно быть целое число от 1, получено ${String(args[1])}`);
      return `${count}d${sides}`;
    },
  },
  dicemax: {
    arity: '1+',
    apply: args => args[0]!,
    raw: (args, tools) => {
      if (args.length > 2) throw new FormulaRuntimeError(tr`«максимум костей» ждёт кости и, если нужно, сколько раз`);
      if (!tools.peak) throw new FormulaRuntimeError(tr`«максимум костей» здесь нельзя: кости здесь не разобрать`);
      const times = args.length > 1 ? Number(args[1]) : 1;
      if (!Number.isFinite(times)) throw new FormulaRuntimeError(tr`второй аргумент «максимум костей» — сколько раз, должен быть числом`);
      return tools.peak(String(args[0]), times);
    },
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

const THROW_NAME = 'roll';

const KNOWN_NAME = 'known';

const LOST = UNKNOWN as unknown as Value;

export function evaluate(ast: Node, resolve: Resolve, tools: Tools = {}): Value {
  return visit(ast);

  function visit(node: Node): Value {
    switch (node.kind) {
      case 'Number':
        return node.value;

      case 'Text':
        return node.value;

      case 'Bool':
        return node.value;

      case 'Ref':

        return resolve(node.tag) as Value;

      case 'Pick': {
        const key = visit(node.key);
        if (hasUnknown(key)) return LOST;
        if (key === null || key === undefined || key === '') return null as unknown as Value;
        if (typeof key === 'boolean' || (typeof key === 'object')) {
          throw new FormulaRuntimeError(tr`«@${node.tag}.[…]»: колонку называет текст или число, получено ${describe(key)}`);
        }
        return resolve(`${node.tag}.${String(key)}${node.rest ? `.${node.rest}` : ''}`) as Value;
      }

      case 'Unary': {
        const operand = visit(node.operand);
        if (hasUnknown(operand)) return LOST;
        if (node.op === NOT) return !given(operand);
        const value = number(operand, tr`операнд «${node.op}»`);
        return node.op === '-' ? -value : value;
      }

      case 'Binary':
        return binary(node);

      case 'Call':
        return call(node);

      case 'Conditional': {
        const test = visit(node.test);
        if (hasUnknown(test)) return LOST;
        return boolean(test, tr`условие тернарного оператора`)
          ? visit(node.then)
          : visit(node.otherwise);
      }

      default:
        throw new FormulaRuntimeError(tr`неизвестный узел дерева: ${(node as Node).kind}`);
    }
  }

  function binary(node: BinaryNode): Value {
    const left = visit(node.left);
    if ((node.op === AND || node.op === OR) && hasUnknown(left)) {
      const other = visit(node.right);
      if (hasUnknown(other)) return LOST;
      return given(other) === (node.op === OR) ? other : LOST;
    }
    if (node.op === AND) return given(left) ? visit(node.right) : left;
    if (node.op === OR) return given(left) ? left : visit(node.right);
    const right = visit(node.right);
    if (hasUnknown(left) || hasUnknown(right)) return LOST;

    if (node.op === '==') return left === right;
    if (node.op === '!=') return left !== right;

    const a = number(left, tr`левый операнд «${node.op}»`);
    const b = number(right, tr`правый операнд «${node.op}»`);

    switch (node.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new FormulaRuntimeError(tr`деление на ноль`);
        return a / b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default:
        throw new FormulaRuntimeError(tr`неизвестный оператор «${node.op}»`);
    }
  }

  function call(node: CallNode): Value {
    const fn = FUNCTIONS[node.name];
    if (!fn && node.name === THROW_NAME) throw new FormulaRuntimeError(diceByStep());
    if (!fn) {
      throw new FormulaRuntimeError(
        tr`нет функции «${saidName(node.name)}»; доступны: ${FUNCTION_NAMES.map(saidName).join(', ')}`);
    }
    if (fn.arity === '1+' && node.args.length < 1) {
      throw new FormulaRuntimeError(tr`«${saidName(node.name)}» требует хотя бы один аргумент`);
    }
    if (typeof fn.arity === 'number' && node.args.length !== fn.arity) {
      throw new FormulaRuntimeError(
        tr`«${saidName(node.name)}» требует аргументов: ${fn.arity}, передано ${node.args.length}`);
    }
    const given = node.args.map(arg => visit(arg));
    if (node.name !== KNOWN_NAME && given.some(hasUnknown)) return LOST;
    if (fn.raw) return fn.raw(given, tools);
    const args = given.map((arg, n) => number(arg, tr`аргумент ${n + 1} функции «${node.name}»`));
    return fn.apply(args);
  }
}

export const given = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== '' && value !== false && !(Array.isArray(value) && !value.length);

const listOf = (value: unknown): Value[] => (Array.isArray(value) ? value as Value[] : [value as Value]);

function numbers(args: Value[], name: string, empty = false): number[] {
  const list = args.flatMap(listOf).filter(value => value !== null && value !== undefined && value !== '');
  if (!list.length && !empty) throw new FormulaRuntimeError(tr`«${name}»: не из чего выбирать — список пуст`);
  return list.map((value, n) => number(value, tr`значение ${n + 1} в «${name}»`));
}

function number(value: unknown, what: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new FormulaRuntimeError(tr`${what} должен быть числом, получено ${describe(value)}`);
  }
  return value;
}

function boolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FormulaRuntimeError(tr`${what} должно быть логическим, получено ${describe(value)}`);
  }
  return value;
}

function describe(value: unknown): string {
  if (typeof value === 'boolean') return tr`логическое ${value}`;
  if (typeof value === 'number') return tr`число ${value}`;
  if (value === undefined) return tr`ничего`;
  return `${typeof value} ${JSON.stringify(value)}`;
}
