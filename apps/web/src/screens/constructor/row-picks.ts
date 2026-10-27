import type { System } from '@vtt/schema';
import { ROW, slugOf } from '@vtt/engine/model/sheet-columns';
import type { BarOption } from '../../store/formula-bar.ts';
import type { Phrase } from './condition-field.tsx';
import { rowNames } from './row-names.ts';

const EACH_ROW = /^cell:([^.]+)\.\*\./u;

export const eachRowTable = (target: unknown): string | undefined => EACH_ROW.exec(String(target ?? ''))?.[1];

export function rowSources(system: System, tableId: string): (readonly [string, string])[] {
  const rows = (system.tables?.[tableId]?.rows ?? []).map(row => slugOf(row.value));
  if (!rows.length) return [];
  const out: (readonly [string, string])[] = [];
  for (const table of Object.values(system.tables ?? {})) {
    if (table.shape !== 'single') continue;
    for (const column of table.columns ?? []) {
      if (column.kind !== 'choice' || !column.from || column.from === tableId) continue;
      const keys = new Set((system.tables?.[column.from]?.columns ?? []).map(one => one.key));
      if (rows.every(row => keys.has(row))) out.push([column.key, column.label || column.key]);
    }
  }
  return out;
}

export interface RowPicks {
  names: Map<string, string>;
  options: BarOption[];
  phrases: Phrase[];
}

export function rowPicks(system: System, target: unknown, names?: Map<string, string>): RowPicks | null {
  const tableId = eachRowTable(target);
  if (!tableId) return null;
  const sources = rowSources(system, tableId);
  return {
    names: new Map([...(names ?? []), ...rowNames(system, tableId)]),
    options: sources.map(([key, label]): BarOption => ({
      group: 'эта строка',
      label: `«${label}» → клетка этой строки`,
      onPick: (insert, bar) => bar.write(insert(`@${key}.[@${ROW}]`)),
    })),
    phrases: sources.map(([key, label]) => ({ expr: `не пусто(@${key})`, label: `«${label}» выбрано` })),
  };
}
