import { EngineError } from '../engine/errors.ts';
import type { System, Table, TableRow, TableColumn, CellView, Field, FieldValue, CellMark, Holder, Placement } from './types.ts';
import type { SheetPart, Control } from '@vtt/schema';
import { linkOf, rowByKey } from './tables.ts';

export type { CellMark };

type Loose = Record<string, unknown>;

export const slugOf = (value: unknown): string => String(value ?? '').replace(/[^\p{L}\p{N}_]+/gu, '_');

export const rowKeyOf = (row: TableRow): string => slugOf(row.value);

export const addressOf = (table: string, row: TableRow | string, column: string): string =>
  `${table}.${typeof row === 'string' ? row : rowKeyOf(row)}.${column}`;

export const isFormulaCell = (value: unknown): value is { expr: string } =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Loose).expr === 'string');

export type CellSource =
  | { kind: 'value'; value: unknown }
  | { kind: 'formula'; expr: string }
  | { kind: 'input' };

export function cellSource(column: TableColumn, row?: TableRow): CellSource {
  const cell = (row?.cells ?? {})[column.key];
  if (isFormulaCell(cell)) return { kind: 'formula', expr: cell.expr };
  if (cell !== undefined && cell !== '') return { kind: 'value', value: cell };
  if (column.expr !== undefined) return { kind: 'formula', expr: column.expr.expr };
  return { kind: 'input' };
}

export const isSingle = (table: Table | undefined): boolean => table?.shape === 'single';

export const holderOf = (table: Table | undefined): Holder | null =>
  (table ? table.owner ?? (isSingle(table) ? 'sheet' : null) : null);

export const onSheet = (table: Table | undefined): boolean => holderOf(table) !== null;

export const isLive = (table: Table | undefined, column: TableColumn, row: TableRow): boolean =>
  onSheet(table) && cellSource(column, row).kind !== 'value';

export const liveColumnsOf = (table: Table | undefined): TableColumn[] =>
  (onSheet(table) ? table!.columns ?? [] : []).filter(column => (table!.rows ?? []).some(row => isLive(table, column, row)));

export const viewOf = (table: Table | undefined, column: string, row?: TableRow): CellView => {
  const spec = (table?.columns ?? []).find(c => c.key === column);
  const own: CellView = {
    ...(spec?.title !== undefined ? { label: spec.title } : {}),
    ...(spec?.roll !== undefined ? { roll: spec.roll } : {}),
    ...(spec?.default !== undefined ? { default: spec.default } : {}),
  };
  return { ...own, ...row?.view?.[column] };
};

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
  const link = linkOf(column);
  const other = link ? system.tables?.[link] : undefined;
  const target = rowByKey(other, cell);
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

const TYPE_WORDS: Record<string, string> = { number: 'число', text: 'текст', boolean: 'да или нет', choice: 'вариант' };

export const valueWord = (value: unknown): string =>
  (typeof value === 'boolean' ? (value ? 'да' : 'нет')
    : Array.isArray(value) ? (value.length ? value.map(valueWord).join(', ') : '—')
      : value === null || value === undefined || value === '' ? '—' : String(value));

export function misfit(field: Pick<Field, 'label' | 'value'>, value: unknown): string | null {
  if (field.value.kind !== 'stored' || value === null || value === undefined) return null;
  const { type, many } = field.value;
  if (Array.isArray(value) !== Boolean(many)) {
    return many ? `«${field.label}» хранит список значений` : `«${field.label}» хранит одно значение, а не список`;
  }
  const items = Array.isArray(value) ? value : [value];
  const ok = items.every(item => (type === 'number' ? typeof item === 'number'
    : type === 'boolean' ? typeof item === 'boolean'
      : type === 'text' ? typeof item === 'string'
        : typeof item !== 'object'));
  return ok ? null : `«${field.label}» хранит ${TYPE_WORDS[type] ?? type}, а пришло ${JSON.stringify(value)}`;
}

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
  const link = linkOf(column);
  if (link && rest.length) {
    const target = rowByKey(system.tables?.[link], cell);
    if (!target) throw new EngineError(`${where}: «${String(cell)}» нет в таблице «${link}»`);
    return rowPath(system, link, target, rest);
  }
  if (column.kind === 'field') return `@${String(cell)}${rest.length ? `.${rest.join('.')}` : ''}`;
  if (rest.length) throw new EngineError(`${where}: «${column.label || head}» — не ссылка, дальше идти некуда`);
  return literal(cell);
}

export interface RowStep { column: string; table: string; key: string; via?: string }

export function rowSteps(system: System, tableId: string, path: string[], row?: TableRow): RowStep[] {
  const out: RowStep[] = [];
  let table = system.tables?.[tableId];
  let tableKey = tableId;
  let at: TableRow | undefined = row;
  for (const [index, key] of path.entries()) {
    const column = (table?.columns ?? []).find(c => c.key === key);
    if (!table || !column) return [];
    const last = index === path.length - 1;
    const link = !last ? linkOf(column) : undefined;
    const cell = at ? cellSource(column, at) : undefined;
    const target = link && cell?.kind === 'value' ? rowByKey(system.tables?.[link], cell.value) : undefined;
    out.push({
      column: column.label || column.key,
      table: table.label || tableKey,
      key: tableKey,
      ...(link ? { via: target ? (target.label ?? String(target.value)) : (system.tables?.[link]?.label || link) } : {}),
    });
    if (!link) break;
    table = system.tables?.[link];
    tableKey = link;
    at = target;
  }
  return out;
}

export type RowPiece = { text: string } | { chip: string };

function pickedColumn(system: System, tableId: string, row: TableRow, head: string, tail: string): string | undefined {
  const link = fieldLinkOf(system, fieldOf(system, head));
  const path = tail ? tail.slice(1).split('.') : [];
  const column = path.length === 1 ? (system.tables?.[tableId]?.columns ?? []).find(c => c.key === path[0]) : undefined;
  const source = column ? cellSource(column, row) : undefined;
  if (!link || source?.kind !== 'value') return undefined;
  const target = (system.tables?.[link]?.columns ?? []).find(c => c.key === String(source.value));
  return target ? target.label || target.key : undefined;
}

export function rowPieces(system: System, tableId: string, row: TableRow, expr: string): RowPiece[] {
  const out: RowPiece[] = [];
  const pattern = new RegExp(`@([\\p{L}\\p{N}_]+)\\.\\[\\s*@${ROW}((?:\\.[\\p{L}\\p{N}_]+)*)\\s*\\]|@${ROW}((?:\\.[\\p{L}\\p{N}_]+)*)|@([\\p{L}\\p{N}_.]+)`, 'gu');
  let at = 0;
  for (const found of expr.matchAll(pattern)) {
    if (found.index! > at) out.push({ text: expr.slice(at, found.index).replace(/\*/g, '×') });
    at = found.index! + found[0].length;
    if (found[1] !== undefined) {
      const label = fieldOf(system, found[1])?.label ?? found[1];
      const picked = pickedColumn(system, tableId, row, found[1], found[2] ?? '');
      out.push({ chip: picked ? `${label} · ${picked}` : `${label} · колонка по значению` });
      continue;
    }
    const match = [found[0], found[3], found[4]] as const;
    if (match[2] !== undefined) {
      const label = fieldOf(system, match[2])?.label;
      out.push(label ? { chip: label } : { text: match[0] });
      continue;
    }
    const tail = match[1] ?? '';
    const steps = rowSteps(system, tableId, tail ? tail.slice(1).split('.') : [], row);
    if (!steps.length) { out.push(tail ? { text: match[0] } : { chip: String(row.label ?? row.value) }); continue; }
    const landed = [...steps].reverse().find(step => step.via)?.via ?? String(row.label ?? row.value);
    out.push({ chip: `${landed} · ${steps[steps.length - 1]!.column}` });
  }
  if (at < expr.length) out.push({ text: expr.slice(at).replace(/\*/g, '×') });
  return out;
}

export const rowWords = (system: System, tableId: string, row: TableRow, expr: string): string =>
  rowPieces(system, tableId, row, expr).map(piece => ('chip' in piece ? piece.chip : piece.text)).join('');

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

function recordPath(system: System, tableId: string, cells: Record<string, unknown>, path: string[]): string {
  const table = system.tables?.[tableId];
  const where = `тип «${table?.label || tableId}»`;
  const [head, ...rest] = path;
  if (!head) throw new EngineError(`${where}: «@${ROW}» без колонки — напишите, какую клетку записи взять`);
  const found = (table?.columns ?? []).find(c => c.key === head);
  if (!found) throw new EngineError(`${where}: колонки «${head}» нет`);
  let spec: TableColumn = found;
  const cell = cells[head];
  if (Array.isArray(cell)) throw new EngineError(`${where}: «${spec.label || head}» — список, одним числом его не взять`);
  let expr = literal(cell ?? '');
  for (const step of rest) {
    const link = linkOf(spec);
    if (!link) throw new EngineError(`${where}: «${spec.label || spec.key}» — не ссылка, дальше «${step}» идти некуда`);
    expr = `таблица(${JSON.stringify(link)}, ${expr}, ${JSON.stringify(step)})`;
    const next: TableColumn | undefined = (system.tables?.[link]?.columns ?? []).find(c => c.key === step);
    if (!next) throw new EngineError(`${where}: у таблицы «${link}» нет колонки «${step}»`);
    spec = next;
  }
  return `(${expr})`;
}

export function withRecord<T>(system: System, tableId: string, cells: Record<string, unknown>, value: T): T {
  if (typeof value === 'string') {
    return (value.includes(`@${ROW}`)
      ? value.replace(ROW_REF, (_, tail: string) => recordPath(system, tableId, cells, tail ? tail.slice(1).split('.') : []))
      : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => withRecord(system, tableId, cells, item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, withRecord(system, tableId, cells, v)])) as T;
  }
  return value;
}

export const defaultLabel = (column: TableColumn, first: boolean): string =>
  (first ? '{label}' : `${column.label || column.key}: {label}`);

const valueOf = (column: TableColumn, start: unknown): FieldValue => {
  const kind = column.kind ?? 'number';
  const type = (STORED.includes(kind) ? kind : 'text') as 'number' | 'text' | 'boolean' | 'choice';
  const many = type === 'choice' && column.many === true;
  return {
    kind: 'stored', type,
    ...(column.from && type === 'choice' ? { from: column.from } : {}),
    ...(many ? { many: true as const } : {}),
    default: (many ? (Array.isArray(start) ? start : []) : start ?? ZERO[type]) as number | string | boolean,
    ...boundsOf(column),
  };
};

const flatBound = (bound: unknown): number | string => (typeof bound === 'number' ? bound : String((bound as { expr?: unknown }).expr ?? ''));

function boundsOf(column: TableColumn): { min?: number | string; max?: number | string } {
  return {
    ...(column.min !== undefined ? { min: flatBound(column.min) } : {}),
    ...(column.max !== undefined ? { max: flatBound(column.max) } : {}),
  };
}

const livesOf = (table: Table): { lives?: 'group' | 'desk' } => {
  const holder = holderOf(table);
  return holder === 'group' || holder === 'desk' ? { lives: holder } : {};
};

function singleFields(tableId: string, table: Table): Field[] {
  return (table.columns ?? []).map((column): Field => {
    return {
      tag: column.key,
      label: column.label ?? column.key,
      ...(column.roll ? { roll: column.roll } : {}),
      value: column.expr !== undefined ? { kind: 'formula', expr: column.expr.expr, ...boundsOf(column) } : valueOf(column, column.default),
      ...livesOf(table),
      home: tableId,
    };
  });
}

function rowFields(system: System, tableId: string, table: Table): Field[] {
  const columns = liveColumnsOf(table);
  const out: Field[] = [];
  for (const row of table.rows ?? []) {
    for (const [at, column] of columns.entries()) {
      const source = cellSource(column, row);
      if (source.kind === 'value') continue;
      const view = viewOf(table, column.key, row);
      const value: FieldValue = source.kind === 'formula'
        ? rowRefs(system, tableId, row, { kind: 'formula', expr: withRow(system, tableId, row, source.expr), ...boundsOf(column) }) as FieldValue
        : rowRefs(system, tableId, row, deep(system, table, row, valueOf(column, view.default))) as FieldValue;
      const roll = view.roll ? rowRefs(system, tableId, row, deep(system, table, row, view.roll)) as Field['roll'] : undefined;
      out.push({
        tag: addressOf(tableId, row, column.key),
        label: fill(system, table, row, view.label ?? defaultLabel(column, at === 0)),
        ...(roll ? { roll } : {}),
        value,
        ...livesOf(table),
        home: tableId,
        cell: { table: tableId, row: rowKeyOf(row), column: column.key },
      });
    }
  }
  return out;
}

export function tableFields(system: System, tableId: string): Field[] {
  const table = system.tables?.[tableId];
  if (!table || !onSheet(table)) return [];
  return isSingle(table) ? singleFields(tableId, table) : rowFields(system, tableId, table);
}

export interface FieldProblem { table: string; message: string }

interface Built { fields: Field[]; byTag: Map<string, Field>; problems: FieldProblem[] }

const EMPTY: Built = { fields: [], byTag: new Map(), problems: [] };

const built = new WeakMap<object, Built>();

export function buildFields(system: System): Built {
  const fields: Field[] = [];
  const problems: FieldProblem[] = [];
  for (const id of Object.keys(system.tables ?? {})) {
    try { fields.push(...tableFields(system, id)); } catch (err) {
      problems.push({ table: id, message: (err as Error).message });
    }
  }
  const byTag = new Map<string, Field>();
  for (const field of fields) if (!byTag.has(field.tag)) byTag.set(field.tag, field);
  return { fields, byTag, problems };
}

function builtOf(system: System): Built {
  const tables = system.tables;
  if (!tables) return EMPTY;
  let hit = built.get(tables);
  if (!hit) { hit = buildFields(system); built.set(tables, hit); }
  if (!system.blocks) return hit;
  let byTables = placedCache.get(system.blocks);
  if (!byTables) { byTables = new WeakMap(); placedCache.set(system.blocks, byTables); }
  let placed = byTables.get(hit);
  if (!placed) { placed = placeFields(system, hit); byTables.set(hit, placed); }
  return placed;
}

const placedCache = new WeakMap<object, WeakMap<Built, Built>>();

const partHas = (part: SheetPart, field: Field): boolean =>
  part.table === field.home
  && (!part.columns || part.columns.includes(field.cell?.column ?? field.tag))
  && (!part.rows || (field.cell !== undefined && part.rows.includes(field.cell.row)));

export function viewIn(part: SheetPart, field: Field): Control | undefined {
  const column = field.cell?.column ?? field.tag;
  const own = field.cell ? part.views?.[`${field.cell.row}.${column}`] : undefined;
  const base = part.views?.[column];
  return own ? { ...base, ...own } : base;
}

export function sectionOf(system: System, part: SheetPart, field: Field): Pick<Field, 'section' | 'sectionAt' | 'sectionBy'> {
  if (!part.by || !field.cell) return {};
  const table = system.tables?.[field.home];
  const row = (table?.rows ?? []).find(r => rowKeyOf(r) === field.cell!.row);
  const column = (table?.columns ?? []).find(c => c.key === part.by);
  if (!row || !column) return {};
  const source = cellSource(column, row);
  if (source.kind !== 'value') return { sectionBy: addressOf(field.home, row, column.key) };
  const value = source.value;
  if (value === undefined || value === null || value === '') return {};
  const options = column.kind === 'choice' && column.from ? system.tables?.[column.from]?.rows ?? [] : [];
  const at = options.findIndex(r => String(r.value) === String(value));
  if (typeof value === 'boolean') return { section: value ? part.views?.[column.key]?.yes ?? 'да' : part.views?.[column.key]?.no ?? 'нет', sectionAt: value ? 1 : 0 };
  return at >= 0 ? { section: String(options[at]!.label ?? options[at]!.value), sectionAt: at } : { section: String(value) };
}

function orderIn(system: System, at: number, part: SheetPart, field: Field): number {
  const table = system.tables?.[part.table];
  const column = field.cell?.column ?? field.tag;
  const columns = part.columns ?? (table?.columns ?? []).map(c => c.key);
  const rows = part.rows ?? (table?.rows ?? []).map(rowKeyOf);
  const col = Math.max(0, columns.indexOf(column));
  const row = field.cell ? Math.max(0, rows.indexOf(field.cell.row)) : 0;
  return at * 1_000_000 + row * 1_000 + col;
}

function placeFields(system: System, base: Built): Built {
  const blocks = system.blocks ?? [];
  const fields = base.fields.map(field => {
    const placements: Placement[] = [];
    for (const block of blocks) {
      const at = block.parts.findIndex(p => partHas(p, field));
      if (at < 0) continue;
      const part = block.parts[at]!;
      const control = viewIn(part, field);
      placements.push({ group: block.name, ...sectionOf(system, part, field), ...(control ? { control } : {}), order: orderIn(system, at, part, field) });
    }
    if (!placements.length) return field;
    return { ...field, ...placements[0], placements };
  });
  const byTag = new Map<string, Field>();
  for (const field of fields) if (!byTag.has(field.tag)) byTag.set(field.tag, field);
  return { fields, byTag, problems: base.problems };
}

export const forgetFields = (system: System): void => { if (system.tables) built.delete(system.tables); };

export const fieldsOf = (system: System): Field[] => builtOf(system).fields;

export const fieldOf = (system: System, tag: string): Field | undefined => builtOf(system).byTag.get(tag);

export const hasField = (system: System, tag: string): boolean => builtOf(system).byTag.has(tag);

export const fieldProblems = (system: System): FieldProblem[] => builtOf(system).problems;

export const singleTables = (system: System): [string, Table][] =>
  Object.entries(system.tables ?? {}).filter(([, table]) => isSingle(table));

export function columnOfField(system: System, field: Field): TableColumn | undefined {
  const table = system.tables?.[field.cell?.table ?? field.home];
  return (table?.columns ?? []).find(c => c.key === (field.cell?.column ?? field.tag));
}

export const fieldLinkOf = (system: System, field: Field | undefined): string | undefined =>
  (!field ? undefined
    : field.value.kind === 'stored' && field.value.type === 'choice' ? field.value.from
      : linkOf(columnOfField(system, field)));

export function columnOf(system: System, tag: string): { table: string; column: TableColumn } | undefined {
  for (const [id, table] of singleTables(system)) {
    const column = (table.columns ?? []).find(c => c.key === tag);
    if (column) return { table: id, column };
  }
  return undefined;
}

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Loose).sort().map(key => [key, sorted((value as Loose)[key])]));
  }
  return value;
};

export const same = (a: unknown, b: unknown): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));


const SINGLE_NAMES: Record<Holder, { id: string; label: string }> = {
  sheet: { id: 'лист', label: 'Лист' },
  desk: { id: 'стол', label: 'Стол' },
  group: { id: 'группа', label: 'Группа' },
};

export const singleTableOf = (system: System, holder: Holder = 'sheet'): string | undefined =>
  singleTables(system).find(([, table]) => holderOf(table) === holder)?.[0];

function freeTableId(system: System, base: string): string {
  let id = base;
  while (system.tables?.[id] || hasField(system, id)) id = `${id}_`;
  return id;
}

export function withColumn(system: System, column: TableColumn, holder: Holder = 'sheet'): System {
  const id = singleTableOf(system, holder) ?? freeTableId(system, SINGLE_NAMES[holder].id);
  const table: Table = system.tables?.[id]
    ?? { label: SINGLE_NAMES[holder].label, shape: 'single', ...(holder === 'sheet' ? {} : { owner: holder }), columns: [] };
  return { ...system, tables: { ...system.tables, [id]: { ...table, columns: [...table.columns ?? [], column] } } };
}

export function mapColumns(system: System, change: (column: TableColumn, table: string) => TableColumn | null): System {
  const tables = { ...system.tables };
  for (const [id, table] of singleTables(system)) {
    tables[id] = { ...table, columns: (table.columns ?? []).map(c => change(c, id)).filter((c): c is TableColumn => c !== null) };
  }
  return { ...system, tables };
}

export const editColumn = (system: System, tag: string, change: (column: TableColumn) => TableColumn | null): System =>
  mapColumns(system, column => (column.key === tag ? change(column) : column));
