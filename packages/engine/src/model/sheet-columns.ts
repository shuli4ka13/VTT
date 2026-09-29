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
  if (!tail) return typeof cell === 'boolean' ? (cell ? 'да' : 'нет') : String(cell);
  const other = column.from ? system.tables?.[column.from] : undefined;
  const target = (other?.rows ?? []).find(r => String(r.value) === String(cell));
  if (!target || !other) throw new EngineError(`таблица «${table.label ?? ''}»: «{${name}}» — «${String(cell)}» нет в таблице «${column.from}»`);
  return token(system, other, target, tail);
}

const fill = (system: System, table: Table, row: TableRow, text: string): string =>
  text.replace(/\{([\p{L}\p{N}_.]+)\}/gu, (_, name: string) => token(system, table, row, name));

function deep(system: System, table: Table, row: TableRow, value: unknown): unknown {
  if (typeof value === 'string') {
    const whole = /^\{([\p{L}\p{N}_]+)\}$/u.exec(value);
    const raw = whole && !['key', 'value', 'label'].includes(whole[1]!) ? (row.cells ?? {})[whole[1]!] : undefined;
    return typeof raw === 'number' || typeof raw === 'boolean' ? raw : fill(system, table, row, value);
  }
  if (Array.isArray(value)) return value.map(item => deep(system, table, row, item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, deep(system, table, row, v)]));
  }
  return value;
}

const STORED = ['number', 'text', 'boolean', 'choice'];

const ZERO: Record<string, unknown> = { number: 0, text: '', boolean: false, choice: '' };

export function columnValue(column: TableColumn, own?: unknown): Loose {
  if (column.kind === 'expr') {
    return { kind: 'formula', expr: column.expr ?? String(own ?? '') };
  }
  const type = STORED.includes(column.kind ?? '') ? column.kind! : 'number';
  return {
    kind: 'stored', type,
    ...(column.from ? { from: column.from } : {}),
    default: column.start ?? ZERO[type],
    ...(column.min !== undefined ? { min: column.min } : {}),
    ...(column.max !== undefined ? { max: column.max } : {}),
  };
}

export const ROW = 'строка';

const ROW_REF = new RegExp(`@${ROW}((?:\\.[\\p{L}\\p{N}_]+)*)`, 'gu');

const literal = (value: unknown): string =>
  (typeof value === 'number' ? String(value) : typeof value === 'boolean' ? (value ? 'да' : 'нет') : JSON.stringify(String(value ?? '')));

function rowPath(system: System, tableId: string, row: TableRow, path: string[]): string {
  const table = system.tables![tableId]!;
  if (!path.length) return literal(row.value);
  const [head, ...rest] = path;
  const column = (table.columns ?? []).find(c => c.key === head);
  const where = `таблица «${table.label || tableId}», строка «${row.label ?? row.value}»`;
  if (!column) throw new EngineError(`${where}: колонки «${head}» нет`);
  if (column.sheet) {
    if (rest.length) throw new EngineError(`${where}: «${column.label || head}» — поле листа, дальше идти некуда`);
    return `@${cellTag(system, tableId, row, column)}`;
  }
  const cell = (row.cells ?? {})[head!];
  if (column.kind === 'choice' && rest.length) {
    const target = (system.tables?.[column.from ?? '']?.rows ?? []).find(r => String(r.value) === String(cell));
    if (!target) throw new EngineError(`${where}: «${String(cell)}» нет в таблице «${column.from}»`);
    return rowPath(system, column.from!, target, rest);
  }
  if (column.kind === 'tag') return `@${String(cell)}${rest.length ? `.${rest.join('.')}` : ''}`;
  if (column.kind === 'expr') return `(${withRow(system, tableId, row, String(cell ?? column.expr ?? ''))})`;
  if (rest.length) throw new EngineError(`${where}: «${column.label || head}» — не ссылка, дальше идти некуда`);
  return literal(cell);
}

export const withRow = (system: System, tableId: string, row: TableRow, expr: string): string =>
  expr.replace(ROW_REF, (_, tail: string) => rowPath(system, tableId, row, tail ? tail.slice(1).split('.') : []));

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
      const raw = columnValue(column, (row.cells ?? {})[column.key]);
      const value = raw.kind === 'formula' ? { ...raw, expr: withRow(system, tableId, row, String(raw.expr)) } : raw;
      out.push({
        ...(deep(system, table, row, { ...spec, value }) as Loose),
        tag: fill(system, table, row, String(tag)),
        ...(group || row.group ? { group: String(row.group ?? deep(system, table, row, group)) } : {}),
        cell: { table: tableId, row: rowKeyOf(row), column: column.key },
      } as unknown as Field);
    }
  }
  return out;
}

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Loose).sort().map(key => [key, sorted((value as Loose)[key])]));
  }
  return value;
};

export const same = (a: unknown, b: unknown): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

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
