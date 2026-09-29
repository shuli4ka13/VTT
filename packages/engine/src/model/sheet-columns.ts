import { EngineError } from '../engine/errors.ts';
import type { System, Table, TableRow, TableColumn, Field } from './types.ts';

export interface CellMark { table: string; row: string; column: string }

type Loose = Record<string, unknown>;

export const rowKeyOf = (row: TableRow): string => String(row.key ?? row.value ?? '');

export const sheetColumnsOf = (table: Table | undefined): TableColumn[] =>
  (table?.columns ?? []).filter(column => Boolean(column.sheet));

function token(system: System, table: Table, row: TableRow, name: string): string {
  if (name === 'key') return rowKeyOf(row);
  if (name === 'value') return String(row.value ?? '');
  if (name === 'label') return String(row.label ?? row.value ?? '');
  const [head, tail] = name.split('.');
  const column = (table.columns ?? []).find(c => c.key === head);
  const cell = (row.cells ?? {})[head!];
  if (!column || cell === undefined) {
    throw new EngineError(`таблица «${table.label ?? ''}»: в шаблоне «{${name}}» — у строки «${row.label ?? row.value}» нет такой ячейки`);
  }
  if (!tail) return String(cell);
  const other = column.from ? system.tables?.[column.from] : undefined;
  const target = (other?.rows ?? []).find(r => String(r.value) === String(cell));
  if (!target || !other) throw new EngineError(`таблица «${table.label ?? ''}»: «{${name}}» — «${String(cell)}» нет в таблице «${column.from}»`);
  return token(system, other, target, tail);
}

const fill = (system: System, table: Table, row: TableRow, text: string): string =>
  text.replace(/\{([\p{L}\p{N}_.]+)\}/gu, (_, name: string) => token(system, table, row, name));

function deep(system: System, table: Table, row: TableRow, value: unknown): unknown {
  if (typeof value === 'string') return fill(system, table, row, value);
  if (Array.isArray(value)) return value.map(item => deep(system, table, row, item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, deep(system, table, row, v)]));
  }
  return value;
}

export const cellTag = (system: System, tableId: string, row: TableRow, column: TableColumn): string => {
  const table = system.tables![tableId]!;
  return fill(system, table, row, String((column.sheet as Loose).tag));
};

export function tableFields(system: System, tableId: string): Field[] {
  const table = system.tables?.[tableId];
  const columns = sheetColumnsOf(table);
  if (!table || !columns.length) return [];
  const out: Field[] = [];
  for (const row of table.rows ?? []) {
    for (const column of columns) {
      const { tag, group, ...spec } = column.sheet as Loose;
      out.push({
        ...(deep(system, table, row, spec) as Loose),
        tag: fill(system, table, row, String(tag)),
        ...(group || row.group ? { group: String(row.group ?? deep(system, table, row, group)) } : {}),
        cell: { table: tableId, row: rowKeyOf(row), column: column.key },
      } as unknown as Field);
    }
  }
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function withTableFields(system: System): System {
  const made = new Map<string, Field[]>();
  for (const id of Object.keys(system.tables ?? {})) {
    const fields = tableFields(system, id);
    if (fields.length) made.set(id, fields);
  }
  const placed = new Set<string>();
  const out: Field[] = [];
  for (const field of system.fields) {
    const mark = (field as { cell?: CellMark }).cell;
    if (!mark) { out.push(field); continue; }
    if (placed.has(mark.table) || !made.has(mark.table)) continue;
    placed.add(mark.table);
    out.push(...made.get(mark.table)!);
  }
  for (const [id, fields] of made) if (!placed.has(id)) out.push(...fields);
  const fields = out.map(field => system.fields.find(old => old.tag === field.tag && same(old, field)) ?? field);
  return same(fields, system.fields) ? system : { ...system, fields };
}
