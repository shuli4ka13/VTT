import { FormulaRuntimeError } from './errors.ts';
import type { Node, BinaryNode, CallNode } from './ast.ts';
import type { Resolve } from '../model/types.ts';

export type Value = number | boolean | string;

export interface Tools {
  roll?: (notation: string, times: number, keep?: number) => number;
  peak?: (notation: string, times: number) => number;
  table?: (name: string, key: Value | Value[], column: string | null) => Value;
  rows?: (table: string, column: string) => Value[];
}

interface Fn {
  arity: number | '1+';
  apply: (args: number[]) => number;
  raw?: (args: Value[], tools: Tools) => Value;
}

const FUNCTIONS: Record<string, Fn> = {
  'округлить вниз': { arity: 1, apply: args => Math.floor(args[0]!) },
  'округлить вверх': { arity: 1, apply: args => Math.ceil(args[0]!) },
  округлить: { arity: 1, apply: args => Math.round(args[0]!) },
  модуль: { arity: 1, apply: args => Math.abs(args[0]!) },
  'меньшее из': { arity: '1+', apply: () => 0, raw: args => Math.min(...numbers(args, 'меньшее из')) },
  'большее из': { arity: '1+', apply: () => 0, raw: args => Math.max(...numbers(args, 'большее из')) },
  сумма: { arity: '1+', apply: () => 0, raw: args => numbers(args, 'сумма', true).reduce((sum, value) => sum + value, 0) },
  среднее: {
    arity: '1+',
    apply: () => 0,
    raw: args => {
      const list = numbers(args, 'среднее', true);
      if (!list.length) throw new FormulaRuntimeError('«среднее»: список пуст');
      return list.reduce((sum, value) => sum + value, 0) / list.length;
    },
  },
  сколько: {
    arity: '1+',
    apply: () => 0,
    raw: args => {
      if (args.length > 2) throw new FormulaRuntimeError('«сколько» ждёт список и, если нужно, какое значение считать');
      const list = listOf(args[0]).filter(value => value !== null && value !== undefined && value !== '');
      return args.length === 2 ? list.filter(value => String(value) === String(args[1])).length : list.length;
    },
  },
  строки: {
    arity: 2,
    apply: () => 0,
    raw: (args, tools) => {
      if (!tools.rows) throw new FormulaRuntimeError('«строки» здесь нельзя: таблиц системы тут не видно');
      return tools.rows(String(args[0]), String(args[1])) as unknown as Value;
    },
  },
  есть: {
    arity: 2,
    apply: () => 0,
    raw: args => {
      const list = args[0] as unknown;
      const wanted = String(args[1]);
      return Array.isArray(list) ? list.some(item => String(item) === wanted) : String(list) === wanted;
    },
  },
  или: {
    arity: '1+',
    apply: args => args[0]!,
    raw: args => {
      const found = args.find(value => value !== null && value !== undefined && value !== '');
      if (found === undefined) throw new FormulaRuntimeError('«или»: ни одно значение не задано');
      return found;
    },
  },
  первый: {
    arity: 1,
    apply: () => 0,
    raw: args => {
      const list = listOf(args[0]).filter(value => value !== null && value !== undefined && value !== '');
      return (list[0] ?? null) as Value;
    },
  },
  пусто: {
    arity: 1,
    apply: () => 0,
    raw: args => args[0] === null || args[0] === undefined || args[0] === '' || (Array.isArray(args[0]) && !(args[0] as unknown[]).length),
  },
  все: {
    arity: '1+',
    apply: () => 0,
    raw: args => args.every((value, n) => boolean(value, `аргумент ${n + 1} функции «все»`)),
  },
  любое: {
    arity: '1+',
    apply: () => 0,
    raw: args => args.some((value, n) => boolean(value, `аргумент ${n + 1} функции «любое»`)),
  },
  не: {
    arity: 1,
    apply: () => 0,
    raw: args => !boolean(args[0], 'аргумент функции «не»'),
  },
  таблица: {
    arity: '1+',
    apply: () => 0,
    raw: (args, tools) => {
      if (args.length < 2 || args.length > 3) {
        throw new FormulaRuntimeError('«таблица» требует два или три аргумента: какая таблица, по чему искать и, если нужно, какая колонка');
      }
      if (!tools.table) throw new FormulaRuntimeError('«таблица» здесь нельзя: таблиц системы тут не видно');
      return tools.table(String(args[0]), args[1] as Value, args.length > 2 ? String(args[2]) : null);
    },
  },
  кинуть: {
    arity: '1+',
    apply: args => args[0]!,
    raw: (args, tools) => {
      if (!tools.roll) {
        throw new FormulaRuntimeError('«кинуть» здесь нельзя: кости бросает только шаг эффекта');
      }
      const notation = String(args[0]);
      const times = args.length > 1 ? Number(args[1]) : 1;
      if (!Number.isFinite(times)) {
        throw new FormulaRuntimeError('второй аргумент «кинуть» — сколько раз, должен быть числом');
      }
      const keep = args.length > 2 ? Number(args[2]) : undefined;
      if (keep !== undefined && (!Number.isInteger(keep) || keep === 0)) {
        throw new FormulaRuntimeError('третий аргумент «кинуть» — сколько костей оставить: число лучших, со знаком минус — худших');
      }
      return tools.roll(notation, times, keep);
    },
  },
  'максимум костей': {
    arity: '1+',
    apply: args => args[0]!,
    raw: (args, tools) => {
      if (args.length > 2) throw new FormulaRuntimeError('«максимум костей» ждёт кости и, если нужно, сколько раз');
      if (!tools.peak) throw new FormulaRuntimeError('«максимум костей» здесь нельзя: кости здесь не разобрать');
      const times = args.length > 1 ? Number(args[1]) : 1;
      if (!Number.isFinite(times)) throw new FormulaRuntimeError('второй аргумент «максимум костей» — сколько раз, должен быть числом');
      return tools.peak(String(args[0]), times);
    },
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

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
        if (key === null || key === undefined || key === '') return null as unknown as Value;
        if (typeof key === 'boolean' || (typeof key === 'object')) {
          throw new FormulaRuntimeError(`«@${node.tag}.[…]»: колонку называет текст или число, получено ${describe(key)}`);
        }
        return resolve(`${node.tag}.${String(key)}${node.rest ? `.${node.rest}` : ''}`) as Value;
      }

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
    if (fn.raw) return fn.raw(node.args.map(arg => visit(arg)), tools);
    const args = node.args.map((arg, n) => number(visit(arg), `аргумент ${n + 1} функции «${node.name}»`));
    return fn.apply(args);
  }
}

const listOf = (value: unknown): Value[] => (Array.isArray(value) ? value as Value[] : [value as Value]);

function numbers(args: Value[], name: string, empty = false): number[] {
  const list = args.flatMap(listOf).filter(value => value !== null && value !== undefined && value !== '');
  if (!list.length && !empty) throw new FormulaRuntimeError(`«${name}»: не из чего выбирать — список пуст`);
  return list.map((value, n) => number(value, `значение ${n + 1} в «${name}»`));
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
