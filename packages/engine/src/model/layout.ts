import type { SheetPart } from '@vtt/schema';
import type { System } from './types.ts';
import { rowKeyOf } from './sheet-columns.ts';

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
}

export function tidyLayout(system: System): void {
  if (!system.blocks) return;
  for (const block of system.blocks) {
    block.parts = block.parts.flatMap(part => {
      const table = system.tables?.[part.table];
      if (!table) return [];
      const keys = (table.columns ?? []).map(c => c.key);
      const rowKeys = (table.rows ?? []).map(r => rowKeyOf(r));
      const next: SheetPart = { table: part.table };
      if (part.columns) {
        const columns = part.columns.filter(key => keys.includes(key));
        if (!columns.length) return [];
        if (columns.length < keys.length) next.columns = columns;
      }
      if (part.rows) {
        const rows = part.rows.filter(key => rowKeys.includes(key));
        if (!rows.length) return [];
        if (rows.length < rowKeys.length) next.rows = rows;
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
