import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import type { Node } from '@vtt/engine/formula';
import { formulaAsLabels } from './formula.tsx';

const COMPARE: Record<string, string> = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const ARITH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function formulaWords(system: System, source: string, names?: Map<string, string>): string {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return formulaAsLabels(system, source, names); }
  const ref = (text: string): string => formulaAsLabels(system, text, names);

  const words = (node: Node, top = false): string => {
    switch (node.kind) {
      case 'Number': return String(node.value);
      case 'Text': return `«${node.value}»`;
      case 'Bool': return node.value ? 'да' : 'нет';
      case 'Ref': return `«${ref(`@${node.tag}`)}»`;
      case 'Pick': return `«${ref(`@${node.tag}`)}» по ${words(node.key, true)}${node.rest ? ` · ${node.rest}` : ''}`;
      case 'Unary': return node.op === '-' ? `−${words(node.operand)}` : `${node.op}${words(node.operand)}`;
      case 'Binary': {
        const op = COMPARE[node.op] ?? ARITH[node.op] ?? node.op;
        const text = `${words(node.left)} ${op} ${words(node.right)}`;
        return top || COMPARE[node.op] ? text : `(${text})`;
      }
      case 'Conditional':
        return `${words(node.then, true)}, если ${words(node.test, true)}, иначе ${words(node.otherwise, true)}`;
      case 'Call': return call(node.name, node.args);
      default: return '';
    }
  };

  const call = (name: string, args: Node[]): string => {
    const all = (join: string) => args.map(arg => words(arg, true)).join(join);
    switch (name) {
      case 'кинуть': {
        const die = words(args[0]!, true);
        const times = args[1] ? words(args[1]) : '';
        const keep = args[2] ? `, оставить ${words(args[2])}` : '';
        return `кинуть ${times && times !== '1' ? `${times} × ` : ''}${die}${keep}`;
      }
      case 'не': {
        const inner = args[0];
        if (inner?.kind === 'Call' && inner.name === 'пусто') return `задано ${words(inner.args[0]!, true)}`;
        return `не ${words(inner!, true)}`;
      }
      case 'пусто': return `не задано ${words(args[0]!, true)}`;
      case 'все': return all(' и ');
      case 'любое': return all(' или ');
      case 'или': return `${words(args[0]!, true)} (если нет — ${words(args[1]!, true)})`;
      case 'меньшее из': return `меньшее из ${all(' и ')}`;
      case 'большее из': return `большее из ${all(' и ')}`;
      case 'сколько': return `сколько ${words(args[1]!, true)} среди ${words(args[0]!, true)}`;
      case 'есть': return `${words(args[0]!, true)} содержит ${words(args[1]!, true)}`;
      case 'первый': return `первый из ${words(args[0]!, true)}`;
      default: return `${name} ${all(', ')}`;
    }
  };

  return words(ast, true);
}
