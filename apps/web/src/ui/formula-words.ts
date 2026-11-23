import type { System } from '@vtt/schema';
import { compile, AND, OR, NOT, ROW, STEP_WORDS, listOf, fieldOf, fieldLinkOf } from '@vtt/engine';
import type { Node } from '@vtt/engine';
import { formulaAsLabels, pickTail, literalSaid } from './formula-labels.ts';
import { localName, DIE_LETTERS } from './formula-lang.ts';
import { t } from '../i18n/index.ts';

const COMPARE: Record<string, string> = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const ARITH: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const rollField = (rest: string): string | undefined => {
  switch (rest) {
    case 'dice.rolls': return t('ui:words.roll.rolls');
    case 'natural': return t('ui:words.roll.natural');
    case 'total': return t('ui:words.roll.total');
    case 'success': return t('ui:words.roll.success');
    case 'margin': return t('ui:words.roll.margin');
    case 'atMax': return t('ui:words.roll.atMax');
    case 'atMin': return t('ui:words.roll.atMin');
    case 'degree': return t('ui:words.roll.degree');
    case 'parts': return t('ui:words.roll.parts');
    case 'versus': return t('ui:words.roll.versus');
    case 'tags': return t('ui:words.roll.tags');
    default: return undefined;
  }
};

const SEEN_ROLL = 'roll';

const ONE_DIE = new RegExp(`^1(?=[${DIE_LETTERS}])`, 'u');

const diceWords = (value: string): string => value.replace(ONE_DIE, '');

const pathWords = (ref: (text: string) => string, tag: string): string => {
  const dot = tag.indexOf('.');
  if (dot < 0) return `«${ref(`@${tag}`)}»`;
  const head = tag.slice(0, dot);
  const rest = tag.slice(dot + 1);
  const known = rollField(rest) ?? (rest.startsWith('parts.') ? t('ui:words.part', { name: rest.slice(6) }) : undefined)
    ?? (head === SEEN_ROLL ? STEP_WORDS.roll.outputs.find(output => output.path === `.${rest}`)?.label : undefined);
  if (known) return t('ui:words.rollField', { head: head === SEEN_ROLL ? t('ui:words.rollHead') : ref(`@${head}`), what: known });
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
      case 'Bool': return node.value ? t('ui:words.yes') : t('ui:words.no');
      case 'Ref': return node.tag.startsWith(`${ROW}.`) ? `«${ref(`@${node.tag}`)}»` : pathWords(ref, node.tag);
      case 'Pick': return node.rest
        ? t('ui:words.pickTail', { ref: ref(`@${node.tag}`), key: words(node.key, true), tail: pickTail(system, node.tag, node.rest) })
        : t('ui:words.pick', { ref: ref(`@${node.tag}`), key: words(node.key, true) });
      case 'Unary': {
        if (node.op === NOT) {
          const inner = node.operand;
          if (inner.kind === 'Call' && inner.name === 'empty') return t('ui:words.set', { x: inner.args[0] ? words(inner.args[0], true) : '…' });
          return t('ui:words.not', { x: words(inner) });
        }
        return node.op === '-' ? `−${words(node.operand)}` : `${node.op}${words(node.operand)}`;
      }
      case 'Binary': {
        if (node.op === AND || node.op === OR) {
          const side = (child: Node) => words(child, child.kind === 'Binary' && child.op === node.op);
          const text = t(node.op === AND ? 'ui:words.and' : 'ui:words.or', { left: side(node.left), right: side(node.right) });
          return top ? text : `(${text})`;
        }
        const op = COMPARE[node.op] ?? ARITH[node.op] ?? node.op;
        const side = (one: Node, other: Node): string => (COMPARE[node.op] ? choiceWord(other, one) ?? words(one) : words(one));
        const text = `${side(node.left, node.right)} ${op} ${side(node.right, node.left)}`;
        return top || COMPARE[node.op] ? text : `(${text})`;
      }
      case 'Conditional': {
        const text = t('ui:words.cond', { then: words(node.then, true), test: words(node.test, true), otherwise: words(node.otherwise, true) });
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
    const allAnd = (): string => (args.length ? args.map(arg => words(arg, true)).reduce((left, right) => t('ui:words.and', { left, right })) : '');
    const arg = (at: number): string => (args[at] ? words(args[at]!, true) : '…');
    switch (name) {
      case 'empty': return t('ui:words.empty', { x: arg(0) });
      case 'min': return t('ui:words.min', { list: allAnd() });
      case 'max': return t('ui:words.max', { list: allAnd() });
      case 'count': return args.length > 1 ? t('ui:words.countAmong', { what: arg(1), among: arg(0) }) : t('ui:words.count', { what: arg(0) });
      case 'has': return t('ui:words.has', { a: arg(0), b: args[0] && args[1] ? choiceWord(args[0], args[1]) ?? arg(1) : arg(1) });
      case 'first': return t('ui:words.first', { x: arg(0) });
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
