import { compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { namesAt } from './names-at.ts';
import { CALL_TAGS } from './references.ts';
import type { Place, NameAt } from './names-at.ts';
import { fieldOf, hasField, ITEM_NAME } from './sheet-columns.ts';
import { choiceTableOf, listOf } from './lists.ts';
import { degreeWords, isRange } from './tables.ts';
import type { System, Effect, Step } from './types.ts';
import { typeColumn } from './inherit.ts';
import type { Where } from './references.ts';

export interface Variants { words: string[]; label: string }

export function tableVariants(system: System, key: string | undefined): Variants | null {
  const table = key ? system.tables?.[key] : undefined;
  if (!table || isRange(table) || table.otherwise !== undefined || table.shape === 'single' || table.shape === 'book') return null;
  const words = (listOf(system, key) ?? []).map(option => String(option.value));
  return words.length ? { words, label: table.label || key! } : null;
}


function itemColumn(system: System, effectId: string, column: string): string | undefined {
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    if (!(table.bindings ?? []).some(binding => binding.effect === effectId)) continue;
    const found = typeColumn(system, key, column);
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

function refsOf(node: Node, out: string[] = []): string[] {
  switch (node.kind) {
    case 'Ref': out.push(node.tag); break;
    case 'Pick': out.push(node.tag); refsOf(node.key, out); break;
    case 'Binary': refsOf(node.left, out); refsOf(node.right, out); break;
    case 'Unary': refsOf(node.operand, out); break;
    case 'Conditional': refsOf(node.test, out); refsOf(node.then, out); refsOf(node.otherwise, out); break;
    case 'Call': node.args.forEach(arg => refsOf(arg, out)); break;
    default: break;
  }
  return out;
}

const onSheet = (system: System, name: string): boolean => {
  const head = name.split('.')[0]!;
  return head === 'строка' || hasField(system, name) || hasField(system, head) || Boolean(system.tables?.[head]) || Boolean(system.constants?.[head]);
};

function tableOfRef(names: readonly NameAt[], tag: string): { table: string; column: string } | null {
  const [head, ...rest] = tag.split('.');
  const name = names.find(one => one.name === head);
  if (!name || !rest.length) return null;
  if (name.kind === 'choice' && name.from && !name.many) return { table: name.from, column: rest[0]! };
  const child = name.children?.find(one => one.path === `.${rest[0]}`);
  if (child?.kind === 'choice' && child.from && rest.length > 1) return { table: child.from, column: rest[1]! };
  return null;
}

interface Site { exprs: string[]; place: Place; where: Where }

function sitesOf(id: string, effect: Effect): Site[] {
  const out: Site[] = [];
  for (const chain of chains(id, effect)) {
    chain.steps.forEach((step, index) => out.push({ exprs: exprsOf(step), place: chain.place(index), where: chain.where(index) }));
  }
  for (const column of effect.returns ?? []) {
    out.push({ exprs: exprsOf(column.expr), place: { part: 'steps', index: (effect.steps ?? []).length }, where: { tab: 'effects', effect: id, part: 'returns', key: column.key } });
  }
  (effect.on ?? []).forEach((handler, h) => {
    if (handler.if) out.push({ exprs: exprsOf(handler.if), place: { part: 'handler-if', handler: h }, where: { tab: 'effects', effect: id, part: 'on', handler: h } });
  });
  return out;
}

export function cellScopeProblems(system: System): { where: Where; text: string }[] {
  const out: { where: Where; text: string }[] = [];
  const report = (where: Where, text: string) => {
    if (!out.some(p => p.text === text && JSON.stringify(p.where) === JSON.stringify(where))) out.push({ where, text });
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const site of sitesOf(id, effect)) {
      const tags = site.exprs.flatMap(expr => { const ast = astOf(expr); return ast ? refsOf(ast) : []; }).filter(tag => tag.includes('.'));
      if (!tags.length) continue;
      const names = namesAt(system, id, site.place);
      for (const tag of tags) {
        const found = tableOfRef(names, tag);
        const table = found ? system.tables?.[found.table] : undefined;
        if (!found || !table) continue;
        const column = (table.columns ?? []).find(one => one.key === found.column)?.label ?? found.column;
        for (const row of table.rows ?? []) {
          const cell = (row.cells ?? {})[found.column];
          if (!cell || typeof cell !== 'object' || !('expr' in cell)) continue;
          const ast = astOf(String((cell as { expr: unknown }).expr));
          for (const used of ast ? refsOf(ast) : []) {
            if (onSheet(system, used)) continue;
            const head = used.split('.')[0]!;
            const at = `клетка «${table.label || found.table}» → «${String(row.value)}» → «${column}» читает «@${used}»`;
            if (table.owner) report(site.where, `${at}: у таблицы с владельцем клетка видит только лист — цель, входы и шаги эффекта ей не видны`);
            else if (head !== ITEM_NAME && head !== CALL_TAGS && !names.some(one => one.name === head)) report(site.where, `${at}, а здесь такого имени нет`);
          }
        }
      }
    }
  }
  return out;
}
