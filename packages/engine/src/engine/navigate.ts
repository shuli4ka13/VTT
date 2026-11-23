import { readCell, type Scope } from './cells.ts';
import { EngineError } from './errors.ts';
import { rowOf } from './tables.ts';
import { tableOf, isRange, linkOf } from '../model/tables.ts';
import { rowKeyOf, slugOf, fieldLinkOf, addressOf } from '../model/sheet-columns.ts';
import type { System, Param, TableColumn } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { fieldOf, hasField } from '../model/sheet-columns.ts';
import { recordKinds } from '../model/owned.ts';
import { walkColumns } from '../model/paths.ts';
import { fixedDefault } from '../model/blank.ts';
import { tr } from '../words/tongue.ts';

type Loose = Record<string, unknown>;

export function referencedTable(system: System, head: string, paramDefs?: Param[]): string | undefined {
  const param = (paramDefs ?? []).find(p => p.key === head) as Loose | undefined;
  if (param) return param.kind === 'choice' ? (param.from as string | undefined) : undefined;
  const field = fieldOf(system, head);
  if (field) return fieldLinkOf(system, field);
  for (const [, kind] of recordKinds(system)) {
    const link = linkOf((kind.columns ?? []).find(p => p.key === head));
    if (link) return link;
  }
  return undefined;
}

export function splitPath(name: string): { head: string; path: string[] } | null {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  return { head: name.slice(0, dot), path: name.slice(dot + 1).split('.') };
}

const columnBy = (columns: readonly TableColumn[] | undefined, key: string | undefined): TableColumn | undefined =>
  (columns ?? []).find(c => c.key === key) ?? (columns ?? []).find(c => c.key === slugOf(key));

function columnAt(system: System, tableId: string, columnKey: string, owner: string): TableColumn {
  const table = tableOf(system, tableId);
  if (!table) throw new EngineError(tr`${owner}: таблицы «${tableId}» нет`);
  const column = columnBy(table.columns, columnKey);
  if (!column) {
    throw new EngineError(
      tr`${owner}: у таблицы «${table.label || tableId}» нет колонки «${columnKey}» — `
      + tr`есть: ${(table.columns ?? []).map(c => c.label || c.key).join(', ') || tr`ни одной`}`);
  }
  return column;
}

function linked(column: TableColumn, columnKey: string, rest: string[], owner: string): string {
  const link = linkOf(column);
  if (!link) {
    throw new EngineError(
      tr`${owner}: колонка «${column.label || columnKey}» не из таблицы — дальше «${rest.join('.')}» идти некуда`);
  }
  return link;
}

function emptyEnd(system: System, tableId: string, path: string[]): unknown {
  let current = tableId;
  for (let i = 0; i < path.length; i++) {
    const column = columnBy(tableOf(system, current)?.columns, path[i]);
    if (!column) return null;
    if (i === path.length - 1) return fixedDefault(column) ?? null;
    const link = linkOf(column);
    if (!link) return null;
    current = link;
  }
  return null;
}

export function walk(
  system: System, pass: Pass, tableId: string, key: unknown, path: string[], owner: string, scope?: Scope,
): unknown {
  let current = tableId;
  let value = key;
  for (let i = 0; i < path.length; i++) {
    if (value === null || value === undefined || value === '') return emptyEnd(system, current, path.slice(i));
    const column = columnAt(system, current, path[i]!, owner);
    const columnKey = column.key;
    const cell = readCell(system, pass, current, value, columnKey, owner, scope);
    if (i === path.length - 1) return cell;
    current = linked(column, columnKey, path.slice(i + 1), owner);
    value = cell;
  }
  return value;
}

export function reach(
  system: System, pass: Pass, tableId: string, key: unknown, path: string[], owner: string,
): string {
  let current = tableId;
  let value = key;
  for (let i = 0; i < path.length; i++) {
    const table = tableOf(system, current);
    if (value === null || value === undefined || value === '') {
      throw new EngineError(tr`${owner}: строка «${table?.label || current}» не задана — какую клетку менять?`);
    }
    const column = columnAt(system, current, path[i]!, owner);
    const columnKey = column.key;
    if (i === path.length - 1) {
      const row = rowOf(system, current, value, owner);
      if (!row) throw new EngineError(tr`${owner}: в таблице «${table?.label || current}» нет строки «${String(value)}»`);
      return addressOf(current, row, columnKey);
    }
    const cell = readCell(system, pass, current, value, columnKey, owner);
    current = linked(column, columnKey, path.slice(i + 1), owner);
    value = cell;
  }
  throw new EngineError(tr`${owner}: у строки «${current}» не сказано, какую колонку менять`);
}

export function resolveAddress(system: System, pass: Pass, name: string): { value: unknown } | null {
  const [tableId, rowKey, segment, ...rest] = name.split('.');
  const table = tableId ? system.tables?.[tableId] : undefined;
  if (!table || rowKey === undefined || isRange(table) || hasField(system, tableId)) return null;
  const row = (table.rows ?? []).find(r => rowKeyOf(r) === slugOf(rowKey));
  if (!row) throw new EngineError(tr`«${name}»: в таблице «${table.label || tableId}» нет строки «${rowKey}»`);
  if (!segment) return { value: row.value };
  const column = columnBy(table.columns, segment)?.key ?? segment;
  const checked = walkColumns(system, tableId!, [column, ...rest]);
  if (!checked.ok) throw new EngineError(`«${name}»: ${checked.text}`);
  const cell = readCell(system, pass, tableId!, row.value, column, name);
  if (!rest.length) return { value: cell };
  const spec = (table.columns ?? []).find(c => c.key === column);
  const link = linkOf(spec);
  if (!link) {
    throw new EngineError(tr`«${name}»: колонка «${spec?.label || column}» не из таблицы — дальше «${rest.join('.')}» идти некуда`);
  }
  return { value: walk(system, pass, link, cell, rest, `«${name}»`) };
}
