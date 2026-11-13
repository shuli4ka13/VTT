import type { System, SystemRoll, RollField } from '@vtt/schema';
import { freeId } from '../../../store/world.ts';
import { readingWord } from '../readback.ts';

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

export function saidOf(number: SystemRoll['number'], die: string, field = 'число поля'): string {
  if (number === 'count') return `${field} — сколько бросить: ${die}`;
  if (number === 'sides') return `${die}, грани — ${field}`;
  const of = field === 'число поля' ? 'числа поля' : field;
  if (number === 'under') return `${die}, успех — не больше ${of}`;
  if (number === 'over') return `${die}, успех — не меньше ${of}`;
  return `${die} + ${field}`;
}

export function rollSaid(system: System, roll: SystemRoll, field?: string): string {
  const name = system.constants?.[roll.die]?.label || roll.die;
  const reading = readingWord(system, roll.die);
  return saidOf(roll.number, reading ? `${name} (${reading})` : name, field);
}
