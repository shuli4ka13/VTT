import { UnknownTagError } from './errors.ts';
import { cellTagOf, columnTagOf } from './cells.ts';
import { isRange } from '../model/tables.ts';
import type { System } from '../model/types.ts';
import { fieldsOf } from '../model/sheet-columns.ts';

export type TargetKind = 'value' | 'cell';

export interface Target {
  tag: string;
  label: string;
  group?: string;
  kind: TargetKind;

  from?: string;
}

export function targets(system: System): Target[] {
  return [
    ...fieldsOf(system).map((f): Target => ({ tag: f.tag, label: f.label, group: f.group, kind: 'value' })),

    ...cellTargets(system),
  ];
}

function cellTargets(system: System): Target[] {
  const out: Target[] = [];
  for (const [id, table] of Object.entries(system.tables ?? {})) {
    if (table.shape === 'single' || table.shape === 'book') continue;
    const name = table.label || id;
    for (const column of (table.columns ?? [])) {
      if (column.kind !== 'number') continue;
      const colName = column.label || column.key;
      out.push({
        tag: columnTagOf(id, column.key),
        label: `${name} → ${colName} — любая строка`,
        group: 'Таблицы',
        kind: 'cell',
        from: id,
      });
      if (isRange(table)) continue;
      for (const row of (table.rows ?? [])) {
        if (row.value === undefined) continue;
        out.push({
          tag: cellTagOf(id, String(row.value), column.key),
          label: `${name} → ${String(row.value)} → ${colName}`,
          group: 'Таблицы',
          kind: 'cell',
          from: id,
        });
      }
    }
  }
  return out;
}

export function findTarget(system: System, tag: string): Target | null {
  return targets(system).find(t => t.tag === tag) || null;
}

export function assertTarget(system: System, tag: string, fromLabel?: string): Target {
  const target = findTarget(system, tag);
  if (!target) throw new UnknownTagError(tag, fromLabel);
  return target;
}

export function labelOf(system: System, tag: string): string {
  const target = findTarget(system, tag);
  return target ? target.label : tag;
}
