import { rowsOf } from './tables.ts';
import { recordsOf, recordKinds, kindsOf } from './owned.ts';
import { compile } from '../formula/index.ts';
import type { Node } from '../formula/index.ts';
import { tagTablesOf, choiceTableOf } from './lists.ts';
import type { System, Compendium } from './types.ts';
import type { Where } from './references.ts';
import { fieldsOf, forgetFields } from './sheet-columns.ts';

type Loose = Record<string, unknown>;

export interface RowUse { where: Where; text: string }

const same = (a: unknown, b: unknown): boolean =>
  a === b || (a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b));

const hasRow = (system: System, table: string, key: unknown): boolean =>
  rowsOf(system.tables?.[table]).some(row => same(row.value, key));

const holds = (value: unknown, key: unknown): boolean =>
  (Array.isArray(value) ? value.some(item => same(item, key)) : same(value, key));

const missing = (system: System, table: string, value: unknown): unknown[] =>
  (Array.isArray(value) ? value : [value])
    .filter(item => item !== undefined && item !== '' && !hasRow(system, table, item));

const swap = (value: unknown, from: unknown, to: unknown): unknown =>
  (Array.isArray(value) ? value.map(item => (same(item, from) ? to : item)) : (same(value, from) ? to : value));

const tagTablesOfTarget = (system: System, mod: Loose): string[] => {
  if (mod.kind !== 'edit' || typeof mod.call !== 'string') return [];
  return tagTablesOf(system.effects[mod.call]);
};

export function modifierLists(system: System): { where: Where; modifiers: Loose[] }[] {
  const out: { where: Where; modifiers: Loose[] }[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    out.push({ where: { tab: 'effects', effect: id }, modifiers: (effect.modifiers ?? []) as unknown as Loose[] });
  }
  for (const [rk, kind] of kindsOf(system)) {
    out.push({ where: { tab: 'records', kind: rk }, modifiers: (kind.modifiers ?? []) as unknown as Loose[] });
  }
  return out;
}

function choiceArgs(system: System, table: string): { where: Where; args: Loose; key: string }[] {
  const out: { where: Where; args: Loose; key: string }[] = [];
  const takes = (effectId: unknown, key: string): boolean =>
    (system.effects[String(effectId)]?.params ?? []).some(p => p.key === key && p.kind === 'choice' && p.from === table);
  const collect = (where: Where, effectId: unknown, args: unknown) => {
    if (!args || typeof args !== 'object') return;
    for (const key of Object.keys(args)) if (takes(effectId, key)) out.push({ where, args: args as Loose, key });
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const [at, step] of [...(effect.steps ?? []), ...(effect.cost ?? [])].entries()) {
      const s = step as unknown as Loose;
      if (s.type === 'emit') collect({ tab: 'effects', effect: id, step: at }, s.effect, s.args);
    }
  }
  for (const [rk, kind] of recordKinds(system)) {
    for (const binding of kind.bindings ?? []) collect({ tab: 'records', kind: rk }, binding.effect, binding.args);
  }
  return out;
}

const constOf = (arg: unknown): unknown => {
  if (!arg || typeof arg !== 'object') return undefined;
  const text = /^\s*"([^"]*)"\s*$/.exec(String((arg as Loose).expr ?? ''));
  return text ? text[1] : undefined;
};

interface StepCondition { where: Where; cond: Loose; rename: (to: unknown) => void }

const quoted = (value: unknown): string => {
  const raw = String(value);
  return raw.includes('"') ? `'${raw}'` : `"${raw}"`;
};

function conditionsIn(source: string): { table: string; column: string; is: string; at: number; raw: string }[] {
  let ast: Node;
  try { ast = compile(source).ast; } catch { return []; }
  const out: { table: string; column: string; is: string; at: number; raw: string }[] = [];
  const walk = (node: Node): void => {
    if (node.kind === 'Call') {
      const [lookup, wanted] = node.args;
      if (node.name === 'есть' && lookup?.kind === 'Call' && lookup.name === 'таблица' && wanted?.kind === 'Text'
        && wanted.at !== undefined && wanted.raw !== undefined) {
        const [table, , column] = lookup.args;
        if (table?.kind === 'Text' && column?.kind === 'Text') {
          out.push({ table: table.value, column: column.value, is: wanted.value, at: wanted.at, raw: wanted.raw });
        }
      }
      node.args.forEach(walk);
    } else if (node.kind === 'Unary') walk(node.operand);
    else if (node.kind === 'Binary') { walk(node.left); walk(node.right); }
    else if (node.kind === 'Conditional') { walk(node.test); walk(node.then); walk(node.otherwise); }
  };
  walk(ast);
  return out;
}

function stepConditions(system: System): StepCondition[] {
  const out: StepCondition[] = [];
  const visit = (steps: unknown, where: (at: number) => Where) => {
    if (!Array.isArray(steps)) return;
    for (const [at, step] of steps.entries()) {
      const when = (step as Loose).if as { expr?: unknown } | undefined;
      if (!when || typeof when.expr !== 'string') continue;
      for (const found of conditionsIn(when.expr)) {
        out.push({
          where: where(at),
          cond: { table: found.table, column: found.column, is: found.is },
          rename: to => {
            const expr = String(when.expr);
            when.expr = `${expr.slice(0, found.at)}${quoted(to)}${expr.slice(found.at + found.raw.length)}`;
          },
        });
      }
    }
  };
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    visit(effect.steps, at => ({ tab: 'effects', effect: id, step: at }));
    visit(effect.cost, at => ({ tab: 'effects', effect: id, step: at, part: 'cost' }));
    (effect.on ?? []).forEach((handler, index) => {
      visit(handler.steps, at => ({ tab: 'effects', effect: id, handler: index, step: at }));
      visit(handler.cost, at => ({ tab: 'effects', effect: id, handler: index, step: at, part: 'cost' }));
    });
    visit(effect.attach, at => ({ tab: 'effects', effect: id, step: at, part: 'attach' }));
    visit(effect.detach, at => ({ tab: 'effects', effect: id, step: at, part: 'detach' }));
  }
  return out;
}

const pointsAt = (system: System, cond: Loose, table: string): boolean =>
  typeof cond.table === 'string'
  && !!system.tables?.[cond.table]?.columns?.some(c => c.key === cond.column && c.kind === 'choice' && c.from === table);

function badCondition(system: System, cond: Loose, what: string): string | undefined {
  const tables = system.tables ?? {};
  const table = typeof cond.table === 'string' ? tables[cond.table] : undefined;
  if (!table) return `${what} смотрит в таблицу «${String(cond.table ?? '')}», которой нет`;
  const column = table.columns?.find(c => c.key === cond.column);
  if (!column) return `у таблицы «${table.label || String(cond.table)}» нет колонки «${String(cond.column ?? '')}» из ${what === 'условие правки' ? 'условия правки' : 'условия шага'}`;
  if (column.kind === 'choice' && column.from && !hasRow(system, column.from, cond.is)) {
    return `${what} ждёт «${String(cond.is)}», а в «${tables[column.from]?.label || column.from}» такой строки нет`;
  }
  return undefined;
}

export function rowUsers(system: System, table: string, key: unknown, compendium?: Compendium): RowUse[] {
  const out: RowUse[] = [];
  for (const [id, other] of Object.entries(system.tables ?? {})) {
    for (const column of (other.columns ?? [])) {
      if (column.kind !== 'choice' || column.from !== table) continue;
      for (const row of rowsOf(other)) {
        if (holds((row.cells ?? {})[column.key], key)) {
          out.push({
            where: { tab: 'rules', section: 'tables', key: id },
            text: `таблица «${other.label || id}», строка «${String(row.value ?? `${row.from}–${row.to}`)}»`,
          });
        }
      }
    }
  }
  for (const { where, modifiers } of modifierLists(system)) {
    for (const m of modifiers) {
      const w = m.where as { table?: string; is?: unknown } | undefined;
      const tagTables = tagTablesOfTarget(system, m);
      const byWhere = w?.table && system.tables?.[w.table]?.columns?.some(c => c.from === table) && same(w.is, key);
      const byTags = tagTables.includes(table)
        && [...((m.tags ?? []) as unknown[]), ...((m.anyTags ?? []) as unknown[]), ...((m.notTags ?? []) as unknown[])].some(t => same(t, key));
      if (byWhere || byTags) out.push({ where, text: 'правка значения' });
    }
  }
  for (const { where, cond } of stepConditions(system)) {
    if (pointsAt(system, cond, table) && same(cond.is, key)) out.push({ where, text: 'условие шага' });
  }
  for (const { where, args, key: arg } of choiceArgs(system, table)) {
    if (holds(constOf(args[arg]), key)) out.push({ where, text: 'значение входа при вызове' });
  }
  for (const [rk, kind] of recordKinds(system)) {
    const props = (kind.columns ?? []).filter(p => (p as Loose).kind === 'choice' && (p as Loose).from === table);
    for (const record of recordsOf(compendium)) {
      if (record.table !== rk) continue;
      for (const prop of props) {
        if (holds((record.cells ?? {})[prop.key], key)) {
          out.push({ where: { tab: 'book', record: record.id }, text: `запись «${record.label || record.id}»` });
        }
      }
    }
  }
  for (const field of fieldsOf(system)) {
    if (choiceTableOf(field) !== table) continue;
    const value = field.value as Loose;
    if (value.kind === 'stored' && same(value.default, key)) {
      out.push({ where: { tab: 'sheet', field: field.tag }, text: `поле «${field.label}» — значение по умолчанию` });
    }
  }
  return out;
}

export interface Dangling { where: Where; text: string }

export function danglingRows(system: System, compendium?: Compendium): Dangling[] {
  const out: Dangling[] = [];
  const tables = system.tables ?? {};
  for (const [id, table] of Object.entries(tables)) {
    for (const column of (table.columns ?? [])) {
      if (column.kind !== 'choice') continue;
      const where: Where = { tab: 'rules', section: 'tables', key: id };
      if (!column.from || !tables[column.from]) {
        out.push({ where, text: `колонка «${column.label || column.key}» ссылается на таблицу «${column.from ?? ''}», которой нет` });
        continue;
      }
      for (const row of rowsOf(table)) {
        const lost = missing(system, column.from, (row.cells ?? {})[column.key]);
        if (!lost.length) continue;
        out.push({
          where,
          text: `в строке «${String(row.value)}» колонка «${column.label || column.key}» указывает на «${lost.map(String).join('», «')}», а в «${tables[column.from]!.label || column.from}» такой строки нет`,
        });
      }
    }
  }
  for (const { where, modifiers } of modifierLists(system)) {
    for (const m of modifiers) {
      if (!m.where) continue;
      const text = badCondition(system, m.where as Loose, 'условие правки');
      if (text) out.push({ where, text });
    }
  }
  for (const { where, cond } of stepConditions(system)) {
    const text = badCondition(system, cond, 'условие шага');
    if (text) out.push({ where, text });
  }
  for (const [rk, kind] of recordKinds(system)) {
    for (const prop of (kind.columns ?? [])) {
      const p = prop as Loose;
      if (p.kind !== 'choice' || typeof p.from !== 'string') continue;
      for (const record of recordsOf(compendium)) {
        if (record.table !== rk) continue;
        const lost = missing(system, p.from, (record.cells ?? {})[prop.key]);
        if (!lost.length) continue;
        out.push({
          where: { tab: 'book', record: record.id },
          text: `у «${record.label || record.id}» в «${prop.label || prop.key}» стоит «${lost.map(String).join('», «')}», а в «${tables[p.from]?.label || p.from}» такой строки нет`,
        });
      }
    }
  }
  return out;
}

export function renameRow(system: System, table: string, from: unknown, to: unknown): void {
  const retag = (list: unknown): unknown[] | undefined =>
    (Array.isArray(list) ? list.map(t => (same(t, from) ? to : t)) : undefined);

  for (const row of rowsOf(system.tables?.[table])) {
    if (same(row.value, from)) row.value = to as never;
  }
  for (const other of Object.values(system.tables ?? {})) {
    for (const column of (other.columns ?? [])) {
      if (column.kind !== 'choice' || column.from !== table) continue;
      for (const row of rowsOf(other)) {
        if (row.cells && holds(row.cells[column.key], from)) row.cells[column.key] = swap(row.cells[column.key], from, to);
      }
    }
  }
  for (const { modifiers } of modifierLists(system)) {
    for (const m of modifiers) {
      const w = m.where as { table?: string; is?: unknown } | undefined;
      if (w?.table && system.tables?.[w.table]?.columns?.some(c => c.from === table) && same(w.is, from)) w.is = to;
      if (tagTablesOfTarget(system, m).includes(table)) {
        if (m.tags) m.tags = retag(m.tags);
        if (m.anyTags) m.anyTags = retag(m.anyTags);
        if (m.notTags) m.notTags = retag(m.notTags);
      }
    }
  }
  for (const { args, key } of choiceArgs(system, table)) {
    const value = constOf(args[key]);
    if (holds(value, from)) args[key] = { expr: JSON.stringify(swap(value, from, to)) };
  }
  for (const { cond, rename } of stepConditions(system).reverse()) {
    if (pointsAt(system, cond, table) && same(cond.is, from)) rename(to);
  }
  for (const other of Object.values(system.tables ?? {})) {
    const choices = (other.columns ?? []).filter(column => column.kind === 'choice' && column.from === table);
    for (const column of choices) {
      if (same(column.default, from)) column.default = to as typeof column.default;
      for (const row of other.rows ?? []) {
        const view = row.view?.[column.key];
        if (view && same(view.default, from)) view.default = to as typeof view.default;
      }
    }
  }
  forgetFields(system);
}

export function renameRowInBook(system: System, book: Compendium, table: string, from: unknown, to: unknown): void {
  for (const [rk, kind] of recordKinds(system)) {
    const props = (kind.columns ?? []).filter(p => (p as Loose).kind === 'choice' && (p as Loose).from === table);
    if (!props.length) continue;
    for (const record of recordsOf(book)) {
      if (record.table !== rk || !record.cells) continue;
      for (const prop of props) {
        if (holds(record.cells[prop.key], from)) record.cells[prop.key] = swap(record.cells[prop.key], from, to);
      }
    }
  }
}
