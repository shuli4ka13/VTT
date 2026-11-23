import type { System, SystemRoll, RollField } from '@vtt/schema';
import { freeId } from '../../../store/world.ts';
import { readingWord } from '../readback.ts';
import { KEYS } from '../factory.ts';
import { dataT, t } from '../../../i18n/author.ts';

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
  const td = dataT(draft);
  const key = freeId(Object.keys(draft.rolls ?? {}), KEYS.roll);
  (draft.rolls ??= {})[key] = { label: td('rolls:new.roll'), die, fields: [] };
  return key;
}

export function saidOf(number: SystemRoll['number'], die: string, field = t('rolls:said.field')): string {
  if (number === 'count') return t('rolls:said.count', { field, die });
  if (number === 'sides') return t('rolls:said.sides', { field, die });
  const of = field === t('rolls:said.field') ? t('rolls:said.fieldOf') : field;
  if (number === 'under') return t('rolls:said.under', { of, die });
  if (number === 'over') return t('rolls:said.over', { of, die });
  return t('rolls:said.bonus', { field, die });
}

export function rollSaid(system: System, roll: SystemRoll, field?: string): string {
  const name = system.constants?.[roll.die]?.label || roll.die;
  const reading = readingWord(system, roll.die);
  return saidOf(roll.number, reading ? `${name} (${reading})` : name, field);
}
