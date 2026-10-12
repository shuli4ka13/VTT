import { readCell } from './cells.ts';
import { EngineError } from './errors.ts';
import { rowOf } from './tables.ts';
import { tableOf, isRange, linkOf } from '../model/tables.ts';
import { rowKeyOf, fieldLinkOf, addressOf } from '../model/sheet-columns.ts';
import type { System, Param, TableColumn } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { fieldOf, hasField } from '../model/sheet-columns.ts';
import { recordKinds } from '../model/owned.ts';

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

function columnAt(system: System, tableId: string, columnKey: string, owner: string): TableColumn {
  const table = tableOf(system, tableId);
  if (!table) throw new EngineError(`${owner}: таблицы «${tableId}» нет`);
  const column = (table.columns ?? []).find(c => c.key === columnKey);
  if (!column) {
    throw new EngineError(
      `${owner}: у таблицы «${table.label || tableId}» нет колонки «${columnKey}» — `
      + `есть: ${(table.columns ?? []).map(c => c.label || c.key).join(', ') || 'ни одной'}`);
  }
  return column;
}

function linked(column: TableColumn, columnKey: string, rest: string[], owner: string): string {
  const link = linkOf(column);
  if (!link) {
    throw new EngineError(
      `${owner}: колонка «${column.label || columnKey}» не из таблицы — дальше «${rest.join('.')}» идти некуда`);
  }
  return link;
}

export function walk(
  system: System, pass: Pass, tableId: string, key: unknown, path: string[], owner: string,
): unknown {
  let current = tableId;
  let value = key;
  for (let i = 0; i < path.length; i++) {
    const columnKey = path[i]!;
    if (value === null || value === undefined || value === '') return null;
    const column = columnAt(system, current, columnKey, owner);
    const cell = readCell(system, pass, current, value, columnKey, owner);
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
    const columnKey = path[i]!;
    const table = tableOf(system, current);
    if (value === null || value === undefined || value === '') {
      throw new EngineError(`${owner}: строка «${table?.label || current}» не задана — какую клетку менять?`);
    }
    const column = columnAt(system, current, columnKey, owner);
    if (i === path.length - 1) {
      const row = rowOf(system, current, value, owner);
      if (!row) throw new EngineError(`${owner}: в таблице «${table?.label || current}» нет строки «${String(value)}»`);
      return addressOf(current, row, columnKey);
    }
    const cell = readCell(system, pass, current, value, columnKey, owner);
    current = linked(column, columnKey, path.slice(i + 1), owner);
    value = cell;
  }
  throw new EngineError(`${owner}: у строки «${current}» не сказано, какую колонку менять`);
}

export function resolveAddress(system: System, pass: Pass, name: string): { value: unknown } | null {
  const [tableId, rowKey, column, ...rest] = name.split('.');
  const table = tableId ? system.tables?.[tableId] : undefined;
  if (!table || rowKey === undefined || isRange(table) || hasField(system, tableId)) return null;
  const row = (table.rows ?? []).find(r => rowKeyOf(r) === rowKey);
  if (!row) throw new EngineError(`«${name}»: в таблице «${table.label || tableId}» нет строки «${rowKey}»`);
  if (!column) return { value: row.value };
  const cell = readCell(system, pass, tableId!, row.value, column, name);
  if (!rest.length) return { value: cell };
  const spec = (table.columns ?? []).find(c => c.key === column);
  const link = linkOf(spec);
  if (!link) {
    throw new EngineError(`«${name}»: колонка «${spec?.label || column}» не из таблицы — дальше «${rest.join('.')}» идти некуда`);
  }
  return { value: walk(system, pass, link, cell, rest, `«${name}»`) };
}
