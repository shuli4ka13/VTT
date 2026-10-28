import { fieldOf, fieldsOf, fieldLinkOf, hasField, rowKeyOf } from './sheet-columns.ts';
import { linkOf, isRange, VALUE_COLUMN } from './tables.ts';
import type { System, TableColumn } from './types.ts';
import { typeColumn, typeColumns } from './inherit.ts';

export type Walked = { ok: true; label: string } | { ok: false; text: string };

const DEEPEST = 3;

const columnName = (column: TableColumn): string => column.label || column.key;

const nextTable = (column: TableColumn): string | undefined => (column.many ? undefined : linkOf(column));

export function walkColumns(system: System, tableId: string, path: readonly string[]): Walked {
  const labels: string[] = [];
  let current = tableId;
  for (const [at, key] of path.entries()) {
    const table = system.tables?.[current];
    if (!table) return { ok: false, text: `таблицы «${current}» нет` };
    const column = typeColumn(system, current, key);
    const last = at === path.length - 1;
    if (!column) {
      if (key === VALUE_COLUMN && last) { labels.push('значение'); break; }
      return { ok: false, text: `у таблицы «${table.label || current}» нет колонки «${key}»` };
    }
    labels.push(columnName(column));
    if (last) break;
    const link = nextTable(column);
    if (!link) {
      const why = column.many ? 'список' : 'не из таблицы';
      return { ok: false, text: `колонка «${columnName(column)}» — ${why}, дальше «${path.slice(at + 1).join('.')}» идти некуда` };
    }
    current = link;
  }
  return { ok: true, label: labels.join(' → ') };
}

export function walkSheet(system: System, path: string): Walked | null {
  const exact = fieldOf(system, path);
  if (exact) return { ok: true, label: exact.label ?? exact.tag };
  const parts = path.split('.');
  const [head, key, ...rest] = parts;
  if (!head) return null;
  if (parts.length === 1) return system.effects?.[head] ? { ok: true, label: system.effects[head]!.label ?? head } : null;
  const table = system.tables?.[head];
  if (table && !isRange(table) && !hasField(system, head)) {
    const row = (table.rows ?? []).find(one => rowKeyOf(one) === key);
    if (!row) return { ok: false, text: `в таблице «${table.label || head}» нет строки «${key}»` };
    const rowLabel = row.label || String(row.value ?? key);
    if (!rest.length) return { ok: true, label: rowLabel };
    const columns = walkColumns(system, head, rest);
    return columns.ok ? { ok: true, label: `${rowLabel} → ${columns.label}` } : columns;
  }
  const field = fieldOf(system, head);
  if (!field) return null;
  const label = field.label ?? field.tag;
  const link = fieldLinkOf(system, field);
  const viaSheet = Object.values(system.tables ?? {}).some(one => one.shape === 'single' && (one.columns ?? []).some(column => column.key === head && column.kind === 'sheet'));
  if (viaSheet) {
    const rest = parts.slice(1).join('.');
    const target = fieldOf(system, parts[1]!);
    return target ? { ok: true, label: `${label} → ${target.label ?? rest}` } : { ok: false, text: `у листа «${label}» нет поля «${rest}»` };
  }
  if (!link) return { ok: false, text: `поле «${label}» не из таблицы — дальше «${parts.slice(1).join('.')}» идти некуда` };
  const columns = walkColumns(system, link, parts.slice(1));
  return columns.ok ? { ok: true, label: `${label} → ${columns.label}` } : columns;
}

export interface ColumnChoice { path: string; label: string; kind: string }

export function columnChoices(system: System, tableId: string): ColumnChoice[] {
  const out: ColumnChoice[] = [];
  const step = (table: string, path: string, words: string, depth: number) => {
    for (const column of typeColumns(system, table)) {
      const at = `${path}.${column.key}`;
      const said = words ? `${words} → ${columnName(column)}` : columnName(column);
      out.push({ path: at, label: said, kind: column.kind ?? 'number' });
      const link = nextTable(column);
      if (link && depth < DEEPEST) step(link, at, said, depth + 1);
    }
  };
  step(tableId, '', '', 1);
  return out;
}

export function sheetChoices(system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const field of fieldsOf(system)) {
    const link = fieldLinkOf(system, field);
    if (!link) continue;
    const label = field.label ?? field.tag;
    for (const one of columnChoices(system, link)) out.set(`${field.tag}${one.path}`, `${label} → ${one.label}`);
  }
  return out;
}
