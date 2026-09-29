import { EngineError } from '../engine/errors.ts';
import type { System, Table, TableRow, TableColumn, TableViewColumn, Field } from './types.ts';

export interface CellMark { table: string; row: string; column: string }

type Loose = Record<string, unknown>;

export const rowKeyOf = (row: TableRow): string => String(row.key ?? row.value ?? '');

export const addressOf = (table: string, row: TableRow | string, column: string): string =>
  `${table}.${typeof row === 'string' ? row : rowKeyOf(row)}.${column}`;

export const isFormulaCell = (value: unknown): value is { expr: string } =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Loose).expr === 'string');

export type CellSource =
  | { kind: 'value'; value: unknown }
  | { kind: 'formula'; expr: string }
  | { kind: 'input' };

export function cellSource(column: TableColumn, row: TableRow): CellSource {
  const cell = (row.cells ?? {})[column.key];
  if (isFormulaCell(cell)) return { kind: 'formula', expr: cell.expr };
  if (cell !== undefined && cell !== '') return { kind: 'value', value: cell };
  if (column.expr !== undefined) return { kind: 'formula', expr: column.expr };
  return { kind: 'input' };
}

export const onSheet = (table: Table | undefined): boolean => Boolean(table?.sheet);

export const isLive = (table: Table | undefined, column: TableColumn, row: TableRow): boolean =>
  onSheet(table) && cellSource(column, row).kind !== 'value';

export const liveColumnsOf = (table: Table | undefined): TableColumn[] =>
  (onSheet(table) ? table!.columns ?? [] : []).filter(column => (table!.rows ?? []).some(row => isLive(table, column, row)));

export const viewOf = (table: Table | undefined, column: string, row?: TableRow): TableViewColumn => ({
  ...table?.sheet?.columns?.[column],
  ...(row ? table?.sheet?.cells?.[`${rowKeyOf(row)}.${column}`] : undefined),
});

function token(system: System, table: Table, row: TableRow, name: string): string {
  if (name === 'key') return rowKeyOf(row);
  if (name === 'value') return String(row.value ?? '');
  if (name === 'label') return String(row.label ?? row.value ?? '');
  const [head, tail] = name.split('.');
  const column = (table.columns ?? []).find(c => c.key === head);
  const cell = (row.cells ?? {})[head!];
  if (!column || cell === undefined || isFormulaCell(cell)) {
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
  if (isLive(table, column, row)) return `@${addressOf(tableId, row, column.key)}${rest.length ? `.${rest.join('.')}` : ''}`;
  const source = cellSource(column, row);
  if (source.kind === 'formula') {
    if (rest.length) throw new EngineError(`${where}: «${column.label || head}» — формула, дальше идти некуда`);
    return `(${withRow(system, tableId, row, source.expr)})`;
  }
  const cell = source.kind === 'value' ? source.value : undefined;
  if (column.kind === 'choice' && rest.length) {
    const target = (system.tables?.[column.from ?? '']?.rows ?? []).find(r => String(r.value) === String(cell));
    if (!target) throw new EngineError(`${where}: «${String(cell)}» нет в таблице «${column.from}»`);
    return rowPath(system, column.from!, target, rest);
  }
  if (column.kind === 'tag') return `@${String(cell)}${rest.length ? `.${rest.join('.')}` : ''}`;
  if (rest.length) throw new EngineError(`${where}: «${column.label || head}» — не ссылка, дальше идти некуда`);
  return literal(cell);
}

export const withRow = (system: System, tableId: string, row: TableRow, expr: string): string =>
  expr.replace(ROW_REF, (_, tail: string) => rowPath(system, tableId, row, tail ? tail.slice(1).split('.') : []));

function rowRefs(system: System, tableId: string, row: TableRow, value: unknown): unknown {
  if (typeof value === 'string') return value.includes(`@${ROW}`) ? withRow(system, tableId, row, value) : value;
  if (Array.isArray(value)) return value.map(item => rowRefs(system, tableId, row, item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, rowRefs(system, tableId, row, v)]));
  }
  return value;
}

export const defaultLabel = (column: TableColumn, first: boolean): string =>
  (first ? '{label}' : `${column.label || column.key}: {label}`);

function storedOf(system: System, tableId: string, table: Table, row: TableRow, column: TableColumn, start: unknown): Loose {
  const kind = column.kind ?? 'number';
  const type = STORED.includes(kind) ? kind : 'text';
  return rowRefs(system, tableId, row, deep(system, table, row, {
    kind: 'stored', type,
    ...(column.from && type === 'choice' ? { from: column.from } : {}),
    default: start ?? ZERO[type],
    ...(column.min !== undefined ? { min: column.min } : {}),
    ...(column.max !== undefined ? { max: column.max } : {}),
  })) as Loose;
}

export function tableFields(system: System, tableId: string): Field[] {
  const table = system.tables?.[tableId];
  const columns = liveColumnsOf(table);
  if (!table || !columns.length) return [];
  const out: Field[] = [];
  for (const row of table.rows ?? []) {
    for (const [at, column] of columns.entries()) {
      const source = cellSource(column, row);
      if (source.kind === 'value') continue;
      const view = viewOf(table, column.key, row);
      const tag = addressOf(tableId, row, column.key);
      const value = source.kind === 'formula'
        ? { kind: 'formula', expr: withRow(system, tableId, row, source.expr) }
        : storedOf(system, tableId, table, row, column, view.start);
      const group = row.group ?? (view.group !== undefined ? fill(system, table, row, view.group) : table.sheet?.group);
      const roll = view.roll ? rowRefs(system, tableId, row, deep(system, table, row, view.roll)) as Loose : undefined;
      out.push({
        tag,
        label: fill(system, table, row, view.label ?? defaultLabel(column, at === 0)),
        ...(group ? { group } : {}),
        ...(roll ? { roll } : {}),
        ...(view.control ? { control: view.control } : {}),
        value,
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
