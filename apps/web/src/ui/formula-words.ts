import type { System } from '@vtt/schema';
import { compile, AND, OR, NOT, ROW, STEP_WORDS, listOf, fieldOf, fieldLinkOf } from '@vtt/engine';
import type { Node } from '@vtt/engine';
import { formulaAsLabels, pickTail, literalSaid } from './formula-labels.ts';
import { localName } from './formula-lang.ts';

const COMPARE: Record<string, string> = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const ARITH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const ROLL_FIELDS: Record<string, string> = {
  'dice.rolls': 'выпавшие кости', natural: 'на кости', total: 'сколько вышло всего', success: 'успех', margin: 'запас',
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

const TABLES = new WeakMap<ReadonlyMap<string, string>, ReadonlyMap<string, string>>();

export const tablesOf = (names: ReadonlyMap<string, string> | undefined): ReadonlyMap<string, string> | undefined =>
  (names ? TABLES.get(names) : undefined);

export const choiceTableOf = (system: System, tag: string, tables?: ReadonlyMap<string, string>): string | undefined =>
  tables?.get(tag) ?? fieldChoice(system, tag);

export const rowLabelOf = (system: System, table: string | undefined, value: string): string | undefined =>
  (table ? (listOf(system, table) ?? []).find(one => String(one.value) === value)?.label : undefined);

const PICKS = new WeakMap<ReadonlyMap<string, string>, ReadonlyMap<string, string>>();

export const picksOf = (names: ReadonlyMap<string, string> | undefined): ReadonlyMap<string, string> | undefined =>
  (names ? PICKS.get(names) : undefined);

export function withPicks<T extends ReadonlyMap<string, string>>(names: T, picks: ReadonlyMap<string, string>): T {
  if (picks.size) PICKS.set(names, picks);
  return names;
}

export function withTables<T extends ReadonlyMap<string, string>>(names: T, tables: ReadonlyMap<string, string> | undefined): T {
  if (tables) TABLES.set(names, tables);
  return names;
}

export function formulaWords(system: System, source: string, names?: ReadonlyMap<string, string>, given?: ReadonlyMap<string, string>): string {
  const tables = given ?? (names ? TABLES.get(names) : undefined);
  let ast: Node;
  try { ast = compile(source).ast; } catch { return formulaAsLabels(system, source, names); }
  const ref = (text: string): string => formulaAsLabels(system, text, names);

  const words = (node: Node, top = false): string => {
    switch (node.kind) {
      case 'Number': return String(node.value);
      case 'Text': return node.dice ? diceWords(node.value) : `«${literalSaid(system, node.value) ?? node.value}»`;
      case 'Bool': return node.value ? 'да' : 'нет';
      case 'Ref': return node.tag.startsWith(`${ROW}.`) ? `«${ref(`@${node.tag}`)}»` : pathWords(ref, node.tag);
      case 'Pick': return `«${ref(`@${node.tag}`)}» по ${words(node.key, true)}${node.rest ? ` · ${pickTail(system, node.tag, node.rest)}` : ''}`;
      case 'Unary': {
        if (node.op === NOT) {
          const inner = node.operand;
          if (inner.kind === 'Call' && inner.name === 'empty') return `задано ${inner.args[0] ? words(inner.args[0], true) : '…'}`;
          return `не ${words(inner)}`;
        }
        return node.op === '-' ? `−${words(node.operand)}` : `${node.op}${words(node.operand)}`;
      }
      case 'Binary': {
        if (node.op === AND || node.op === OR) {
          const side = (child: Node) => words(child, child.kind === 'Binary' && child.op === node.op);
          const text = `${side(node.left)} ${node.op === AND ? 'и' : 'или'} ${side(node.right)}`;
          return top ? text : `(${text})`;
        }
        const op = COMPARE[node.op] ?? ARITH[node.op] ?? node.op;
        const side = (one: Node, other: Node): string => (COMPARE[node.op] ? choiceWord(other, one) ?? words(one) : words(one));
        const text = `${side(node.left, node.right)} ${op} ${side(node.right, node.left)}`;
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

  const choiceWord = (ref: Node, value: Node): string | null => {
    if (ref.kind !== 'Ref' || value.kind !== 'Text' || value.dice) return null;
    const label = rowLabelOf(system, choiceTableOf(system, ref.tag, tables), value.value);
    return label ? `«${label}»` : null;
  };

  const call = (name: string, args: Node[]): string => {
    const all = (join: string) => args.map(arg => words(arg, true)).join(join);
    const arg = (at: number): string => (args[at] ? words(args[at]!, true) : '…');
    switch (name) {
      case 'empty': return `не задано ${arg(0)}`;
      case 'min': return `меньшее из ${all(' и ')}`;
      case 'max': return `большее из ${all(' и ')}`;
      case 'count': return args.length > 1 ? `сколько ${arg(1)} среди ${arg(0)}` : `сколько ${arg(0)}`;
      case 'has': return `${arg(0)} содержит ${args[0] && args[1] ? choiceWord(args[0], args[1]) ?? arg(1) : arg(1)}`;
      case 'first': return `первый из ${arg(0)}`;
      default: return `${localName(name)} ${all(', ')}`;
    }
  };

  return words(ast, true);
}

function fieldChoice(system: System, tag: string): string | undefined {
  for (const one of [tag, tag.slice(tag.indexOf('.') + 1)]) {
    const link = fieldLinkOf(system, fieldOf(system, one));
    if (link) return link;
  }
  return undefined;
}
