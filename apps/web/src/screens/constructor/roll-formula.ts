import type { System, SlotRef } from '@vtt/schema';
import { compile, printFormula, FormulaError } from '@vtt/engine/formula';
import type { Node } from '@vtt/engine/formula';
import { asDice } from '../../words.ts';
import { dieRef, unquote } from './roll-expr.ts';

export interface RollParts {
  die?: SlotRef;
  count?: SlotRef;
  bonus: SlotRef | null;
}

const OP_OF: Record<string, string> = { '>=': 'atLeast', '<=': 'notOver', '>': 'over', '<': 'under', '==': 'equals' };
const ROLL = 'кинуть';

const quoteDice = (text: string): string =>
  text.replace(/кинуть\(\s*(\d*)\s*[кdд]\s*(\d+)\s*(?=[,)])/giu, (_, count: string, sides: string) => `кинуть("${count || 1}к${sides}"`);

function treeOf(text: string): Node | { error: string } {
  try {
    return compile(quoteDice(text.trim())).ast;
  } catch (err) {
    return { error: err instanceof FormulaError ? err.message : String(err) };
  }
}

function walk(text: string, visit: (i: number, ch: string, depth: number) => boolean): void {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (visit(i, ch, depth)) return;
  }
}

function rawRoll(text: string): { args: string[]; tail: string } {
  const open = text.indexOf('(');
  let close = -1;
  const args: string[] = [];
  let start = open + 1;
  walk(text, (i, ch, depth) => {
    if (i <= open) return false;
    if (ch === ',' && depth === 1) { args.push(text.slice(start, i).trim()); start = i + 1; }
    if (ch === ')' && depth === 0) { args.push(text.slice(start, i).trim()); close = i; return true; }
    return false;
  });
  return { args, tail: close < 0 ? '' : text.slice(close + 1).trim() };
}

const isError = (value: unknown): value is { error: string } => Boolean(value && typeof value === 'object' && 'error' in value);

function terms(node: Node): { sign: '+' | '-'; node: Node }[] {
  if (node.kind === 'Binary' && (node.op === '+' || node.op === '-')) {
    return [...terms(node.left), { sign: node.op, node: node.right }];
  }
  return [{ sign: '+', node }];
}

function rollFrom(node: Node, system: System, raw: string): RollParts | { error: string } {
  const [head, ...rest] = terms(node);
  const call = head!.node;
  if (call.kind !== 'Call' || call.name !== ROLL) return { error: 'бросок начинается с «кинуть(кость)»: кинуть(@кость) + прибавка' };
  const [dieNode, countNode, keepNode] = call.args;
  if (!dieNode) return { error: 'в «кинуть(…)» первым — кость: кость системы через @ или «1к20»' };
  if (keepNode) return { error: 'третье число в «кинуть(…)» — «оставить лучшие» — бывает только в расчёте; у броска листа это правка («преимущество»)' };
  let die: SlotRef;
  if (dieNode.kind === 'Ref') {
    if (!system.constants?.[dieNode.tag]) return { error: `«${dieNode.tag}» — не кость системы` };
    die = dieNode.tag;
  } else if (dieNode.kind === 'Text') {
    const m = /^(\d+)?\s*[dдк]\s*(\d+)$/iu.exec(dieNode.value.trim());
    if (!m) return { error: `«${dieNode.value}» — не запись кости: «1к20»` };
    const found = dieRef(Number(m[1] ?? 1), Number(m[2]), system);
    if (typeof found !== 'string') return { error: `в системе нет кости ${asDice(`${m[1] ?? 1}d${m[2]}`)} — заведите её в «Правилах» или выберите через @` };
    die = found;
  } else {
    return { error: 'в «кинуть(…)» первым — кость: кость системы через @ или «1к20»' };
  }
  const own = rawRoll(raw);
  const after = own.tail.trim();
  const tail = rest.length ? (after.startsWith('+') ? after.slice(1).trim() : after.startsWith('-') ? `-${after.slice(1).trim()}` : after) : '';
  return { die, ...(countNode ? { count: { expr: own.args[1] ?? printFormula(countNode) } } : {}), bonus: tail ? { expr: tail } : null };
}

export function parseRollFormula(text: string, system: System): RollParts | { error: string } {
  const tree = treeOf(text);
  if (isError(tree)) return tree;
  if (tree.kind === 'Binary' && OP_OF[tree.op]) return { error: 'здесь только бросок, без сравнения: сравнение с порогом — в шаге «проверка»' };
  return rollFrom(tree, system, quoteDice(text.trim()));
}

const refText = (ref: unknown): string =>
  (ref && typeof ref === 'object' ? String((ref as { expr?: unknown }).expr ?? '') : ref === undefined || ref === null ? '' : String(ref));

export function formatRollFormula(roll: { die?: unknown; count?: unknown; times?: unknown; bonus?: unknown }): string {
  const die = roll.die;
  const head = !die ? '' : typeof die === 'string' ? `@${die}` : `"${asDice(unquote(refText(die)))}"`;
  const repeat = roll.times ?? roll.count;
  const count = repeat ? `, ${refText(repeat)}` : '';
  const tail = refText(roll.bonus).trim();
  return `${ROLL}(${head}${count})${tail ? (tail.startsWith('-') ? ` - ${tail.slice(1).trim()}` : ` + ${tail}`) : ''}`;
}
