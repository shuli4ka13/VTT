import type { Node } from './ast.ts';
import { AND, OR, NOT } from './parse.ts';

const RANK: Record<string, number> = {
  [OR]: 1, [AND]: 2, '==': 4, '!=': 4, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6,
};

const NOT_RANK = 3;
const NEGATE_RANK = 7;
const ATOM = 8;

const rankOf = (node: Node): number => {
  if (node.kind === 'Binary') return RANK[node.op] ?? 0;
  if (node.kind === 'Unary') return node.op === NOT ? NOT_RANK : NEGATE_RANK;
  return ATOM;
};

const COMPARISON = 4;

export const bindsLooser = (node: Node, op: string): boolean => rankOf(node) < (RANK[op] ?? ATOM);

const quote = (value: string): string => (value.includes('"') ? `'${value}'` : `"${value}"`);

export function printFormula(node: Node): string {
  switch (node.kind) {
    case 'Number': return String(node.value);
    case 'Text': return node.dice ? node.raw ?? node.value : quote(node.value);
    case 'Bool': return node.value ? 'да' : 'нет';
    case 'Ref': return `@${node.tag}`;
    case 'Pick': return `@${node.tag}.[${printFormula(node.key)}]${node.rest ? `.${node.rest}` : ''}`;
    case 'Unary': {
      const inner = printFormula(node.operand);
      const own = rankOf(node);
      const wrapped = rankOf(node.operand) < own ? `(${inner})` : inner;
      return node.op === NOT ? `${NOT} ${wrapped}` : `${node.op}${wrapped}`;
    }
    case 'Binary': {
      const rank = rankOf(node);
      const left = printFormula(node.left);
      const right = printFormula(node.right);
      const leftText = rankOf(node.left) < rank ? `(${left})` : left;
      const tight = rankOf(node.right) < rank || (rankOf(node.right) === rank && (node.op === '-' || node.op === '/' || rank === COMPARISON));
      return `${leftText} ${node.op} ${tight ? `(${right})` : right}`;
    }
    case 'Call': return `${node.name}(${node.args.map(printFormula).join(', ')})`;
    case 'Conditional':
      return `если(${printFormula(node.test)}, ${printFormula(node.then)}, ${printFormula(node.otherwise)})`;
    default: return '';
  }
}
