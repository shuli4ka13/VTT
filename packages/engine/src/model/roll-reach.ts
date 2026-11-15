import type { System, Compendium, CompendiumRecord, Param, TableColumn } from './types.ts';
import { compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { fieldsOf } from './sheet-columns.ts';
import { recordsOf, isBook, isUnder } from './owned.ts';
import { typeColumn } from './inherit.ts';
import { isBlank } from './blank.ts';
import { ROLL_CALL } from '../words/calls.ts';

export interface TagReach { tags: Set<string>; open: boolean; book: boolean }

type Loose = Record<string, unknown>;

type Values = string[] | null;

interface Scope { params: readonly Param[]; record?: CompendiumRecord }

const TAGS_PARAM = 'tags';

const words = (list: readonly unknown[]): string[] => list.flatMap(one => (Array.isArray(one) ? one : [one])).filter((one): one is string => typeof one === 'string' && one !== '');

function cellWords(value: unknown): Values {
  if (isBlank(value)) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const one of value) {
    const found = cellWords(one);
    if (found === null) return null;
    out.push(...found);
  }
  return out;
}

const join = (lists: readonly Values[]): Values => (lists.some(list => list === null) ? null : lists.flatMap(list => list!));

export function claimMarks(system: System): [string, string][] {
  const marks: [string, string][] = [];
  for (const table of Object.values(system.tables ?? {})) {
    for (const row of table.rows ?? []) {
      if ((row.cells as Loose | undefined)?.claim === true) marks.push([String(row.value), String(row.label ?? row.value)]);
    }
  }
  return marks;
}

export function rollTagReach(system: System, compendium?: Compendium): TagReach {
  const tags = new Set<string>();
  let open = false;
  const library = new Set((system.library ?? []).map(record => record.id));
  const book = recordsOf(compendium).some(record => !library.has(record.id));
  const records = [...(system.library ?? []), ...recordsOf(compendium).filter(record => !library.has(record.id))];
  const allParams = Object.values(system.effects ?? {}).flatMap(effect => effect.params ?? []);
  const kindsUnder = (table: string): string[] => Object.keys(system.tables ?? {}).filter(key => isUnder(system, key, table));
  const columnOf = (table: string, column: string): TableColumn | undefined =>
    typeColumn(system, table, column) ?? system.tables?.[table]?.columns?.find(one => one.key === column);

  const rowsOf = (table: string): Values => {
    const found = system.tables?.[table];
    if (!found) return null;
    if (isBook(found)) return book ? records.filter(record => isUnder(system, record.table, table)).map(record => record.id) : null;
    return (found.rows ?? []).map(row => String(row.value ?? '')).filter(Boolean);
  };

  const choiceOnly = (table: string, column: string): Values => {
    const defs = kindsUnder(table).map(kind => columnOf(kind, column));
    if (!defs.length || defs.some(def => !def || def.expr !== undefined || def.kind !== 'choice' || !def.from)) return null;
    return join(defs.flatMap(def => [rowsOf(def!.from!), cellWords(def!.default)]));
  };

  const cellOf = (def: TableColumn | undefined, cell: unknown): Values => {
    if (!def) return [];
    if (!isBlank(cell)) return cellWords(cell);
    if (def.expr !== undefined) return null;
    return cellWords(def.default);
  };

  const columnValues = (table: string, column: string): Values => {
    const found = system.tables?.[table];
    if (!found) return null;
    if (isBook(found)) {
      const chosen = choiceOnly(table, column);
      if (chosen) return chosen;
      if (!book) return null;
      return join(records.filter(record => isUnder(system, record.table, table))
        .map(record => cellOf(columnOf(record.table ?? table, column), (record.cells as Loose | undefined)?.[column])));
    }
    const def = columnOf(table, column);
    if (!def) return null;
    return join((found.rows ?? []).map(row => cellOf(def, (row.cells as Loose | undefined)?.[column])));
  };

  const paramValues = (param: Param, column?: string): Values => {
    const from = (param as { from?: string }).from;
    if (!from || (param.kind !== 'choice' && param.kind !== 'record')) return null;
    if (column === undefined) return param.kind === 'choice' ? rowsOf(from) : null;
    return columnValues(from, column);
  };

  const refValues = (tag: string, scope: Scope): Values => {
    const [head, ...rest] = tag.split('.');
    if (!head || rest.length > 1) return null;
    if (head === 'строка') return scope.record && rest.length === 1 ? choiceOnly(scope.record.table ?? '', rest[0]!) : null;
    const own = scope.params.filter(param => param.key === head);
    const candidates = own.length ? own : allParams.filter(param => param.key === head);
    if (!candidates.length) return null;
    return join(candidates.map(param => paramValues(param, rest[0])));
  };

  const nodeValues = (node: Node, scope: Scope): Values => {
    if (node.kind === 'Text') return [node.value];
    if (node.kind === 'Number') return [String(node.value)];
    if (node.kind === 'Conditional') return join([nodeValues(node.then, scope), nodeValues(node.otherwise, scope)]);
    if (node.kind === 'Ref') return refValues(node.tag, scope);
    return null;
  };

  const take = (raw: unknown, scope: Scope): void => {
    if (typeof raw === 'string') { if (raw) tags.add(raw); return; }
    const expr = raw && typeof raw === 'object' && 'expr' in raw ? String((raw as { expr: unknown }).expr ?? '').trim() : '';
    if (!expr) return;
    let found: Values;
    try { found = nodeValues(compile(expr).ast, scope); } catch { found = null; }
    if (found === null) open = true;
    else for (const one of found) if (one) tags.add(one);
  };

  for (const field of fieldsOf(system)) for (const tag of field.roll?.tags ?? []) take(tag, { params: [] });
  for (const [key, rule] of Object.entries(system.rolls ?? {})) {
    tags.add(key);
    for (const tag of rule.tags ?? []) take(tag, { params: [] });
  }
  for (const [mark] of claimMarks(system)) tags.add(mark);

  const steps = (value: unknown, scope: Scope): void => {
    if (Array.isArray(value)) { value.forEach(one => steps(one, scope)); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Loose;
    if (node.type === 'roll' && Array.isArray(node.tags)) for (const tag of node.tags) take(tag, scope);
    for (const child of Object.values(node)) steps(child, scope);
  };
  for (const effect of Object.values(system.effects ?? {})) steps(effect, { params: effect.params ?? [] });
  for (const tag of (system.initiative as { tags?: unknown[] } | undefined)?.tags ?? []) take(tag, { params: [] });

  const marks = (modifiers: unknown, scope: Scope): void => {
    for (const mod of (Array.isArray(modifiers) ? modifiers : []) as Loose[]) {
      if (mod.kind === 'edit' && mod.call === ROLL_CALL && mod.param === TAGS_PARAM) take(mod.value, scope);
    }
  };
  for (const effect of Object.values(system.effects ?? {})) marks(effect.modifiers, { params: effect.params ?? [] });
  for (const kind of Object.values(system.sheets ?? {})) marks((kind as { modifiers?: unknown }).modifiers, { params: [] });
  for (const table of Object.values(system.tables ?? {})) marks((table as { modifiers?: unknown }).modifiers, { params: [] });
  for (const record of records) marks(record.modifiers, { params: [], record });

  return { tags, open, book };
}

export interface TagFilter { tags?: unknown; anyTags?: unknown }

export function unreachedTags(reach: TagReach, filter: TagFilter): string[] {
  if (reach.open) return [];
  const all = words(Array.isArray(filter.tags) ? filter.tags : []);
  const any = words(Array.isArray(filter.anyTags) ? filter.anyTags : []);
  const missing = all.filter(tag => !reach.tags.has(tag));
  if (any.length && !any.some(tag => reach.tags.has(tag))) missing.push(...any);
  return [...new Set(missing)];
}
