import type { SheetPart } from '@vtt/schema';
import type { System } from './types.ts';
import { rowKeyOf, cellSource, isSingle, onSheet } from './sheet-columns.ts';
import { tidyPages } from './pages.ts';

const parts = (system: System): SheetPart[] => (system.blocks ?? []).flatMap(block => block.parts);

export function renameLayoutColumn(system: System, table: string, from: string, to: string): void {
  if (from === to) return;
  for (const part of parts(system)) {
    if (part.table !== table) continue;
    if (part.columns) part.columns = part.columns.map(key => (key === from ? to : key));
    if (part.by === from) part.by = to;
    if (part.views) part.views = Object.fromEntries(Object.entries(part.views).map(([key, view]) => {
      const [a, b] = key.split('.');
      return [b === undefined ? (a === from ? to : a) : `${a}.${b === from ? to : b}`, view];
    }));
  }
}

export function renameLayoutRow(system: System, table: string, from: unknown, to: unknown): void {
  const old = rowKeyOf({ value: from } as never);
  const next = rowKeyOf({ value: to } as never);
  if (old === next) return;
  for (const part of parts(system)) {
    if (part.table !== table) continue;
    if (part.rows) part.rows = part.rows.map(key => (key === old ? next : key));
    if (part.views) part.views = Object.fromEntries(Object.entries(part.views).map(([key, view]) => {
      const [a, b] = key.split('.');
      return [b !== undefined && a === old ? `${next}.${b}` : key, view];
    }));
  }
}

export function renameLayoutTable(system: System, from: string, to: string): void {
  for (const part of parts(system)) if (part.table === from) part.table = to;
  for (const block of system.blocks ?? []) if (block.kinds) block.kinds = block.kinds.map(kind => (kind === from ? to : kind));
}

function sampleAlive(system: System, tag: string): boolean {
  const single = Object.values(system.tables ?? {}).some(table => isSingle(table) && (table.columns ?? []).some(column => column.key === tag && column.expr === undefined));
  if (single) return true;
  const [tableId, row, column, ...rest] = tag.split('.');
  const table = tableId ? system.tables?.[tableId] : undefined;
  if (!table || !row || !column || rest.length || isSingle(table) || !onSheet(table)) return false;
  const spec = (table.columns ?? []).find(one => one.key === column);
  const found = (table.rows ?? []).find(one => rowKeyOf(one) === row);
  return Boolean(spec && found && cellSource(spec, found).kind === 'input');
}

export function tidySample(system: System): void {
  if (!system.sample) return;
  const kept = Object.entries(system.sample).filter(([tag]) => sampleAlive(system, tag));
  if (kept.length === Object.keys(system.sample).length) return;
  if (kept.length) system.sample = Object.fromEntries(kept); else delete system.sample;
}

export function retagSample(system: System, retag: (tag: string) => string): void {
  if (!system.sample) return;
  system.sample = Object.fromEntries(Object.entries(system.sample).map(([tag, value]) => [retag(tag), value]));
}

export function tidyLayout(system: System): void {
  tidyPages(system);
  tidySample(system);
  if (!system.blocks) return;
  for (const block of system.blocks) {
    block.parts = block.parts.flatMap(part => {
      const table = system.tables?.[part.table];
      if (!table) return [];
      const keys = (table.columns ?? []).map(c => c.key);
      const rowKeys = (table.rows ?? []).map(r => rowKeyOf(r));
      const next: SheetPart = { table: part.table };
      const same = (list: string[], all: string[]) => list.length === all.length && list.every((key, at) => key === all[at]);
      if (part.columns) {
        const columns = part.columns.filter(key => keys.includes(key));
        if (!columns.length) return [];
        const live = (table.columns ?? [])
          .filter(column => isSingle(table) || (table.rows ?? []).some(row => cellSource(column, row).kind !== 'value'))
          .map(column => column.key);
        if (!same(columns, keys) && !same(columns.filter(key => live.includes(key)), live)) next.columns = columns;
      }
      if (part.rows) {
        const rows = part.rows.filter(key => rowKeys.includes(key));
        if (!rows.length) return [];
        if (!same(rows, rowKeys)) next.rows = rows;
      }
      if (part.by && keys.includes(part.by)) next.by = part.by;
      const views = Object.entries(part.views ?? {}).filter(([key]) => {
        const [a, b] = key.split('.');
        return b === undefined ? keys.includes(a!) : rowKeys.includes(a!) && keys.includes(b);
      });
      if (views.length) next.views = Object.fromEntries(views);
      return [next];
    });
  }
}
