import type { System, SystemRoll, RollField } from '@vtt/schema';
import { freeId } from '../../../store/world.ts';

export function rollOfColumn(system: System, table: string, column: string): { key: string; roll: SystemRoll; entry: RollField } | null {
  for (const [key, roll] of Object.entries(system.rolls ?? {})) {
    const entry = roll.fields.find(one => one.table === table && one.column === column);
    if (entry) return { key, roll, entry };
  }
  return null;
}

export function setColumnRoll(draft: System, table: string, column: string, key: string | null): void {
  const was = rollOfColumn(draft, table, column);
  for (const roll of Object.values(draft.rolls ?? {})) roll.fields = roll.fields.filter(one => !(one.table === table && one.column === column));
  const target = key ? draft.rolls?.[key] : undefined;
  if (target) target.fields.push(was ? { ...was.entry } : { table, column });
}

export function setEntryTags(draft: System, table: string, column: string, tags: string[]): void {
  const found = rollOfColumn(draft, table, column);
  if (!found) return;
  const entry = draft.rolls![found.key]!.fields.find(one => one.table === table && one.column === column)!;
  if (tags.length) entry.tags = tags; else delete entry.tags;
}

export function addRoll(draft: System, die: string): string {
  const key = freeId(Object.keys(draft.rolls ?? {}), 'бросок');
  (draft.rolls ??= {})[key] = { label: 'Новый бросок', die, fields: [] };
  return key;
}
