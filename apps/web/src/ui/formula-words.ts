import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import type { Node } from '@vtt/engine/formula';
import { chainsOfEffect } from '@vtt/engine/engine/effects';
import { ROW } from '@vtt/engine/model/sheet-columns';
import { formulaAsLabels } from './formula.tsx';

const COMPARE: Record<string, string> = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const ARITH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const ROLL_FIELDS: Record<string, string> = {
  'dice.rolls': 'выпавшие кости', natural: 'на кости', total: 'итог', success: 'успех', margin: 'запас',
  atMax: 'кости на максимуме', atMin: 'кости на минимуме', degree: 'ступень', parts: 'части', versus: 'порог',
  tags: 'метки броска',
};

const SEEN_ROLL = 'roll';

const diceWords = (value: string): string => value.replace(/^1(?=к)/u, '');

const callResult = (system: System, head: string, rest: string): string | null => {
  for (const effect of Object.values(system.effects ?? {})) {
    for (const step of chainsOfEffect(effect).flat() as Record<string, unknown>[]) {
      if (step.id !== head || step.type !== 'emit' || typeof step.effect !== 'string') continue;
      const column = system.effects?.[step.effect]?.returns?.find(one => one.key === rest);
      if (column) return column.label ?? column.key;
    }
  }
  return null;
};

const pathWords = (system: System, ref: (text: string) => string, tag: string): string => {
  const dot = tag.indexOf('.');
  if (dot < 0) return `«${ref(`@${tag}`)}»`;
  const head = tag.slice(0, dot);
  const rest = tag.slice(dot + 1);
  const known = ROLL_FIELDS[rest] ?? (rest.startsWith('parts.') ? `часть «${rest.slice(6)}»` : undefined);
  if (known) return `«${head === SEEN_ROLL ? 'Бросок' : ref(`@${head}`)}»: ${known}`;
  const whole = ref(`@${tag}`);
  const result = whole === tag ? callResult(system, head, rest) : null;
  if (result === null) return `«${whole}»`;
  const name = head.replace(/_/g, ' ');
  return name.toLowerCase() === result.toLowerCase() ? `«${name}»` : `«${name} — ${result}»`;
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
      case 'Ref': return node.tag.startsWith(`${ROW}.`) ? `«${ref(`@${node.tag}`)}»` : pathWords(system, ref, node.tag);
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
    const arg = (at: number): string => (args[at] ? words(args[at]!, true) : '…');
    switch (name) {
      case 'кинуть': {
        const only = args.length === 1 ? args[0]! : null;
        if (only?.kind === 'Text' && only.dice) return words(only, true);
        const times = args[1] ? words(args[1]) : '';
        const keep = args[2] ? `, оставить ${words(args[2])}` : '';
        return `кинуть ${times && times !== '1' ? `${times} × ` : ''}${arg(0)}${keep}`;
      }
      case 'не': {
        const inner = args[0];
        if (inner?.kind === 'Call' && inner.name === 'пусто') return `задано ${inner.args[0] ? words(inner.args[0], true) : '…'}`;
        return `не ${arg(0)}`;
      }
      case 'пусто': return `не задано ${arg(0)}`;
      case 'все': return all(' и ');
      case 'любое': return all(' или ');
      case 'или': return `${arg(0)} (если нет — ${arg(1)})`;
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
