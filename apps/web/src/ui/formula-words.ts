import type { System } from '@vtt/schema';
import { compile, AND, OR, NOT } from '@vtt/engine/formula';
import type { Node } from '@vtt/engine/formula';
import { ROW } from '@vtt/engine/model/sheet-columns';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import { formulaAsLabels } from './formula-labels.ts';

const COMPARE: Record<string, string> = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const ARITH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const ROLL_FIELDS: Record<string, string> = {
  'dice.rolls': 'выпавшие кости', natural: 'на кости', total: 'итог', success: 'успех', margin: 'запас',
  atMax: 'кости на максимуме', atMin: 'кости на минимуме', degree: 'ступень', parts: 'части', versus: 'порог',
  tags: 'метки броска',
};

const SEEN_ROLL = 'roll';

const diceWords = (value: string): string => value.replace(/^1(?=к)/u, '');

const pathWords = (ref: (text: string) => string, tag: string): string => {
  const dot = tag.indexOf('.');
  if (dot < 0) return `«${ref(`@${tag}`)}»`;
  const head = tag.slice(0, dot);
  const rest = tag.slice(dot + 1);
  const known = ROLL_FIELDS[rest] ?? (rest.startsWith('parts.') ? `часть «${rest.slice(6)}»` : undefined)
    ?? (head === SEEN_ROLL ? STEP_WORDS.roll.outputs.find(output => output.path === `.${rest}`)?.label : undefined);
  if (known) return `«${head === SEEN_ROLL ? 'Бросок' : ref(`@${head}`)}»: ${known}`;
  return `«${ref(`@${tag}`)}»`;
};

export function formulaWords(system: System, source: string, names?: Map<string, string>): string {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return formulaAsLabels(system, source, names); }
  const ref = (text: string): string => formulaAsLabels(system, text, names);

  const words = (node: Node, top = false): string => {
    switch (node.kind) {
      case 'Number': return String(node.value);
      case 'Text': return node.dice ? diceWords(node.value) : `«${node.value}»`;
      case 'Bool': return node.value ? 'да' : 'нет';
      case 'Ref': return node.tag.startsWith(`${ROW}.`) ? `«${ref(`@${node.tag}`)}»` : pathWords(ref, node.tag);
      case 'Pick': return `«${ref(`@${node.tag}`)}» по ${words(node.key, true)}${node.rest ? ` · ${node.rest}` : ''}`;
      case 'Unary': {
        if (node.op === NOT) {
          const inner = node.operand;
          if (inner.kind === 'Call' && inner.name === 'пусто') return `задано ${inner.args[0] ? words(inner.args[0], true) : '…'}`;
          return `не ${words(inner)}`;
        }
        return node.op === '-' ? `−${words(node.operand)}` : `${node.op}${words(node.operand)}`;
      }
      case 'Binary': {
        if (node.op === AND || node.op === OR) {
          const side = (child: Node) => words(child, child.kind === 'Binary' && child.op === node.op);
          const text = `${side(node.left)} ${node.op} ${side(node.right)}`;
          return top ? text : `(${text})`;
        }
        const op = COMPARE[node.op] ?? ARITH[node.op] ?? node.op;
        const text = `${words(node.left)} ${op} ${words(node.right)}`;
        return top || COMPARE[node.op] ? text : `(${text})`;
      }
      case 'Conditional': {
        const text = `${words(node.then, true)}, если ${words(node.test, true)}, иначе ${words(node.otherwise, true)}`;
        return top ? text : `(${text})`;
      }
      case 'Call': return call(node.name, node.args);
      default: return '';
    }
  };

  const call = (name: string, args: Node[]): string => {
    const all = (join: string) => args.map(arg => words(arg, true)).join(join);
    const arg = (at: number): string => (args[at] ? words(args[at]!, true) : '…');
    switch (name) {
      case 'кинуть': {
        const only = args.length === 1 ? args[0]! : null;
        if (only?.kind === 'Text' && only.dice) return words(only, true);
        const times = args[1] ? words(args[1]) : '';
        const keep = args[2] ? `, оставить ${words(args[2])}` : '';
        return `кинуть ${times && times !== '1' ? `${times} × ` : ''}${arg(0)}${keep}`;
      }
      case 'пусто': return `не задано ${arg(0)}`;
      case 'меньшее из': return `меньшее из ${all(' и ')}`;
      case 'большее из': return `большее из ${all(' и ')}`;
      case 'сколько': return args.length > 1 ? `сколько ${arg(1)} среди ${arg(0)}` : `сколько ${arg(0)}`;
      case 'есть': return `${arg(0)} содержит ${arg(1)}`;
      case 'первый': return `первый из ${arg(0)}`;
      default: return `${name} ${all(', ')}`;
    }
  };

  return words(ast, true);
}
