import { compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { namesAt } from './names-at.ts';
import type { Place, NameAt } from './names-at.ts';
import { fieldOf } from './sheet-columns.ts';
import { choiceTableOf, listOf } from './lists.ts';
import { degreeWords, isRange } from './tables.ts';
import type { System, Effect, Step } from './types.ts';
import type { Where } from './references.ts';

export interface Variants { words: string[]; label: string }

export function tableVariants(system: System, key: string | undefined): Variants | null {
  const table = key ? system.tables?.[key] : undefined;
  if (!table || isRange(table) || table.otherwise !== undefined || table.shape === 'single' || table.shape === 'book') return null;
  const words = (listOf(system, key) ?? []).map(option => String(option.value));
  return words.length ? { words, label: table.label || key! } : null;
}

function columnOf(system: System, tableKey: string, column: string): { kind?: string; from?: string } | undefined {
  const seen = new Set<string>();
  for (let key: string | undefined = tableKey; key && !seen.has(key); key = system.tables?.[key]?.extends as string | undefined) {
    seen.add(key);
    const found = (system.tables?.[key]?.columns ?? []).find(one => one.key === column);
    if (found) return found as { kind?: string; from?: string };
  }
  return undefined;
}

function itemColumn(system: System, effectId: string, column: string): string | undefined {
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    if (!(table.bindings ?? []).some(binding => binding.effect === effectId)) continue;
    const found = columnOf(system, key, column);
    if (found?.kind === 'choice' && found.from) return found.from;
  }
  return undefined;
}

export function variantsOfRef(system: System, effectId: string, steps: readonly Step[], names: readonly NameAt[], tag: string): Variants | null {
  const [head, ...rest] = tag.split('.');
  const tail = rest.join('.');
  const name = names.find(one => one.name === head);
  if (!tail) return name?.kind === 'choice' && !name.many ? tableVariants(system, name.from) : null;
  if (head === 'вещь') return tableVariants(system, itemColumn(system, effectId, tail));
  if (!name) return null;
  if (name.kind === 'sheet' && !name.many) return tableVariants(system, choiceTableOf(fieldOf(system, tail)));
  const child = name.children?.find(one => one.path === `.${tail}`);
  if (child?.kind === 'choice' && child.from) return tableVariants(system, child.from);
  if (tail === 'degree') {
    const check = steps.find(step => step.type === 'check' && step.id === head) as { degrees?: { table?: string } } | undefined;
    const words = degreeWords(system, check?.degrees?.table);
    return words.length ? { words, label: `ступени «${head}»` } : null;
  }
  return null;
}

function comparisons(node: Node, out: { tag: string; word: string }[] = []): { tag: string; word: string }[] {
  switch (node.kind) {
    case 'Binary':
      if (node.op === '==' || node.op === '!=') {
        const [ref, text] = node.left.kind === 'Ref' ? [node.left, node.right] : [node.right, node.left];
        if (ref.kind === 'Ref' && text.kind === 'Text' && !text.dice) out.push({ tag: ref.tag, word: text.value });
      }
      comparisons(node.left, out);
      comparisons(node.right, out);
      break;
    case 'Unary': comparisons(node.operand, out); break;
    case 'Conditional': comparisons(node.test, out); comparisons(node.then, out); comparisons(node.otherwise, out); break;
    case 'Call': node.args.forEach(arg => comparisons(arg, out)); break;
    case 'Pick': comparisons(node.key, out); break;
    default: break;
  }
  return out;
}

function results(node: Node, out: string[] = []): string[] {
  if (node.kind === 'Text' && !node.dice) out.push(node.value);
  else if (node.kind === 'Conditional') { results(node.then, out); results(node.otherwise, out); }
  else if (node.kind === 'Binary' && node.op === 'или') { results(node.left, out); results(node.right, out); }
  return out;
}

function exprsOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) exprsOf(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'expr' && typeof item === 'string') out.push(item);
      else exprsOf(item, out);
    }
  }
  return out;
}

const astOf = (expr: string): Node | null => {
  try { return compile(expr).ast; } catch { return null; }
};

const missing = (word: string, variants: Variants): string =>
  `«${word}» — в таблице «${variants.label}» такого варианта нет; есть ${variants.words.slice(0, 8).map(one => `«${one}»`).join(', ')}${variants.words.length > 8 ? ' …' : ''}`;

interface Chain { steps: Step[]; place: (index: number) => Place; where: (index: number) => Where }

function chains(id: string, effect: Effect): Chain[] {
  const out: Chain[] = [
    { steps: effect.steps ?? [], place: index => ({ part: 'steps', index }), where: step => ({ tab: 'effects', effect: id, step }) },
    { steps: effect.cost ?? [], place: index => ({ part: 'cost', index }), where: step => ({ tab: 'effects', effect: id, step, part: 'cost' }) },
  ];
  (effect.on ?? []).forEach((handler, h) => {
    out.push({ steps: handler.steps ?? [], place: index => ({ part: 'handler', handler: h, index }), where: step => ({ tab: 'effects', effect: id, handler: h, step }) });
    out.push({ steps: handler.cost ?? [], place: index => ({ part: 'handler-cost', handler: h, index }), where: step => ({ tab: 'effects', effect: id, handler: h, step, part: 'cost' }) });
  });
  for (const turn of ['attach', 'detach'] as const) {
    out.push({ steps: effect[turn] ?? [], place: index => ({ part: turn, index }), where: step => ({ tab: 'effects', effect: id, step, part: turn }) });
  }
  return out;
}

export function variantProblems(system: System): { where: Where; text: string }[] {
  const out: { where: Where; text: string }[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const chain of chains(id, effect)) {
      chain.steps.forEach((step, index) => {
        const found = exprsOf(step).flatMap(expr => { const ast = astOf(expr); return ast ? comparisons(ast) : []; });
        if (!found.length) return;
        const names = namesAt(system, id, chain.place(index));
        for (const { tag, word } of found) {
          const variants = variantsOfRef(system, id, chain.steps, names, tag);
          if (variants && !variants.words.includes(word)) out.push({ where: chain.where(index), text: missing(word, variants) });
        }
      });
    }
    for (const column of effect.returns ?? []) {
      if (column.kind !== 'choice' || column.many) continue;
      const variants = tableVariants(system, column.from);
      const ast = astOf(String((column.expr as { expr?: unknown } | undefined)?.expr ?? ''));
      if (!variants || !ast) continue;
      for (const word of results(ast)) {
        if (!variants.words.includes(word)) out.push({ where: { tab: 'effects', effect: id, part: 'returns', key: column.key }, text: `итог «${column.label ?? column.key}»: ${missing(word, variants)}` });
      }
    }
  }
  return out;
}
