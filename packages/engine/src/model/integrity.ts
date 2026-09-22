import { rowsOf } from './tables.ts';
import type { System, Compendium } from './types.ts';
import type { Where } from './references.ts';

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

const tagsTableOf = (system: System, target: unknown): string | undefined => {
  if (typeof target !== 'string' || !target.startsWith('event:')) return undefined;
  return system.effects[target.slice('event:'.length)]?.tagsFrom;
};

function modifierLists(system: System): { where: Where; modifiers: Loose[] }[] {
  const out: { where: Where; modifiers: Loose[] }[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    out.push({ where: { tab: 'effects', effect: id }, modifiers: (effect.modifiers ?? []) as unknown as Loose[] });
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    out.push({ where: { tab: 'records', kind: rk }, modifiers: (kind.modifiers ?? []) as unknown as Loose[] });
  }
  return out;
}

function tagSteps(system: System): { where: Where; step: Loose; tags: unknown[] }[] {
  const out: { where: Where; step: Loose; tags: unknown[] }[] = [];
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const [at, step] of [...(effect.steps ?? []), ...(effect.self ?? [])].entries()) {
      const s = step as unknown as Loose;
      if (s.type === 'emit' && Array.isArray(s.tags)) out.push({ where: { tab: 'effects', effect: id, step: at }, step: s, tags: s.tags });
    }
  }
  return out;
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
            text: `таблица «${other.label || id}», строка «${row.label || String(row.value ?? `${row.from}–${row.to}`)}»`,
          });
        }
      }
    }
  }
  for (const { where, modifiers } of modifierLists(system)) {
    for (const m of modifiers) {
      const w = m.where as { table?: string; is?: unknown } | undefined;
      const tagsTable = tagsTableOf(system, m.target);
      const byWhere = w?.table && system.tables?.[w.table]?.columns?.some(c => c.from === table) && same(w.is, key);
      const byTags = tagsTable === table
        && [...((m.tags ?? []) as unknown[]), ...((m.notTags ?? []) as unknown[])].some(t => same(t, key));
      if (byWhere || byTags) out.push({ where, text: 'правка значения' });
    }
  }
  for (const { where, step, tags } of tagSteps(system)) {
    if (system.effects[String(step.event)]?.tagsFrom === table && tags.some(t => same(t, key))) {
      out.push({ where, text: 'метка вызова' });
    }
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    const props = (kind.props ?? []).filter(p => (p as Loose).kind === 'choice' && (p as Loose).from === table);
    for (const record of [...(compendium?.items ?? []), ...(compendium?.actions ?? [])]) {
      if (record.rk !== rk) continue;
      for (const prop of props) {
        if (holds((record.props ?? {})[prop.key], key)) {
          out.push({ where: { tab: 'book', record: record.id }, text: `запись «${record.label || record.id}»` });
        }
      }
    }
  }
  for (const field of system.fields ?? []) {
    if (field.optionsFrom !== table) continue;
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
          text: `в строке «${row.label || String(row.value)}» колонка «${column.label || column.key}» указывает на «${lost.map(String).join('», «')}», а в «${tables[column.from]!.label || column.from}» такой строки нет`,
        });
      }
    }
  }
  for (const { where, modifiers } of modifierLists(system)) {
    for (const m of modifiers) {
      const w = m.where as { table?: string; column?: string; is?: unknown } | undefined;
      if (!w) continue;
      const table = w.table ? tables[w.table] : undefined;
      const column = table?.columns?.find(c => c.key === w.column);
      if (!table) { out.push({ where, text: `условие правки смотрит в таблицу «${w.table ?? ''}», которой нет` }); continue; }
      if (!column) { out.push({ where, text: `у таблицы «${table.label || w.table}» нет колонки «${w.column ?? ''}» из условия правки` }); continue; }
      if (column.kind === 'choice' && column.from && !hasRow(system, column.from, w.is)) {
        out.push({ where, text: `условие правки ждёт «${String(w.is)}», а в «${tables[column.from]?.label || column.from}» такой строки нет` });
      }
    }
  }
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    for (const prop of (kind.props ?? [])) {
      const p = prop as Loose;
      if (p.kind !== 'choice' || typeof p.from !== 'string') continue;
      for (const record of [...(compendium?.items ?? []), ...(compendium?.actions ?? [])]) {
        if (record.rk !== rk) continue;
        const lost = missing(system, p.from, (record.props ?? {})[prop.key]);
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
      if (tagsTableOf(system, m.target) === table) {
        if (m.tags) m.tags = retag(m.tags);
        if (m.notTags) m.notTags = retag(m.notTags);
      }
    }
  }
  for (const { step } of tagSteps(system)) {
    if (system.effects[String(step.event)]?.tagsFrom === table) step.tags = retag(step.tags);
  }
  for (const field of system.fields ?? []) {
    if (field.optionsFrom !== table) continue;
    const value = field.value as Loose;
    if (value.kind === 'stored' && same(value.default, from)) value.default = to;
  }
}

export function renameRowInBook(system: System, book: Compendium, table: string, from: unknown, to: unknown): void {
  for (const [rk, kind] of Object.entries(system.records ?? {})) {
    const props = (kind.props ?? []).filter(p => (p as Loose).kind === 'choice' && (p as Loose).from === table);
    if (!props.length) continue;
    for (const record of [...(book.items ?? []), ...(book.actions ?? [])]) {
      if (record.rk !== rk || !record.props) continue;
      for (const prop of props) {
        if (holds(record.props[prop.key], from)) record.props[prop.key] = swap(record.props[prop.key], from, to);
      }
    }
  }
}
