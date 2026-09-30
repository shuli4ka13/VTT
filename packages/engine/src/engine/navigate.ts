import { readCell } from './cells.ts';
import { EngineError } from './errors.ts';
import { tableOf, isRange } from '../model/tables.ts';
import { rowKeyOf } from '../model/sheet-columns.ts';
import { choiceTableOf } from '../model/lists.ts';
import type { System, Param } from '../model/types.ts';
import type { Pass } from './calc.ts';
import { fieldOf, hasField } from '../model/sheet-columns.ts';

type Loose = Record<string, unknown>;

export function referencedTable(system: System, head: string, paramDefs?: Param[]): string | undefined {
  const param = (paramDefs ?? []).find(p => p.key === head) as Loose | undefined;
  if (param) return param.kind === 'choice' ? (param.from as string | undefined) : undefined;
  const field = fieldOf(system, head);
  if (field) return choiceTableOf(field);
  for (const kind of Object.values(system.records ?? {})) {
    const prop = (kind.props ?? []).find(p => p.key === head) as Loose | undefined;
    if (prop?.kind === 'choice' && typeof prop.from === 'string') return prop.from;
  }
  return undefined;
}

export function splitPath(name: string): { head: string; path: string[] } | null {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  return { head: name.slice(0, dot), path: name.slice(dot + 1).split('.') };
}

export function walk(
  system: System, pass: Pass, tableId: string, key: unknown, path: string[], owner: string,
): unknown {
  let current = tableId;
  let value = key;
  for (let i = 0; i < path.length; i++) {
    const columnKey = path[i]!;
    if (value === null || value === undefined || value === '') return null;
    const table = tableOf(system, current);
    if (!table) throw new EngineError(`${owner}: таблицы «${current}» нет`);
    const column = (table.columns ?? []).find(c => c.key === columnKey);
    if (!column) {
      throw new EngineError(
        `${owner}: у таблицы «${table.label || current}» нет колонки «${columnKey}» — `
        + `есть: ${(table.columns ?? []).map(c => c.label || c.key).join(', ') || 'ни одной'}`);
    }
    const cell = readCell(system, pass, current, value, columnKey, owner);
    if (i === path.length - 1) return cell;
    if (column.kind !== 'choice' || !column.from) {
      throw new EngineError(
        `${owner}: колонка «${column.label || columnKey}» не из таблицы — дальше «${path.slice(i + 1).join('.')}» идти некуда`);
    }
    current = column.from;
    value = cell;
  }
  return value;
}

export function resolveAddress(system: System, pass: Pass, name: string): { value: unknown } | null {
  const [tableId, rowKey, column, ...rest] = name.split('.');
  const table = tableId ? system.tables?.[tableId] : undefined;
  if (!table || rowKey === undefined || isRange(table) || hasField(system, tableId)) return null;
  const row = (table.rows ?? []).find(r => rowKeyOf(r) === rowKey) ?? (table.rows ?? []).find(r => String(r.value) === rowKey);
  if (!row) throw new EngineError(`«${name}»: в таблице «${table.label || tableId}» нет строки «${rowKey}»`);
  if (!column) return { value: row.value };
  const cell = readCell(system, pass, tableId!, row.value, column, name);
  if (!rest.length) return { value: cell };
  const spec = (table.columns ?? []).find(c => c.key === column);
  if (spec?.kind !== 'choice' || !spec.from) {
    throw new EngineError(`«${name}»: колонка «${spec?.label || column}» не из таблицы — дальше «${rest.join('.')}» идти некуда`);
  }
  return { value: walk(system, pass, spec.from, cell, rest, `«${name}»`) };
}
