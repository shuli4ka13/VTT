import type { Node } from './ast.ts';

const RANK: Record<string, number> = { '==': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1, '+': 2, '-': 2, '*': 3, '/': 3 };

const rankOf = (node: Node): number => {
  if (node.kind === 'Conditional') return 5;
  if (node.kind === 'Binary') return RANK[node.op] ?? 0;
  if (node.kind === 'Unary') return 4;
  return 5;
};

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
      return `${node.op}${rankOf(node.operand) < 4 ? `(${inner})` : inner}`;
    }
    case 'Binary': {
      const rank = rankOf(node);
      const left = printFormula(node.left);
      const right = printFormula(node.right);
      const leftText = rankOf(node.left) < rank ? `(${left})` : left;
      const tight = rankOf(node.right) < rank || (rankOf(node.right) === rank && (node.op === '-' || node.op === '/' || rank === 1));
      return `${leftText} ${node.op} ${tight ? `(${right})` : right}`;
    }
    case 'Call': return `${node.name}(${node.args.map(printFormula).join(', ')})`;
    case 'Conditional':
      return `если(${printFormula(node.test)}, ${printFormula(node.then)}, ${printFormula(node.otherwise)})`;
    default: return '';
  }
}
