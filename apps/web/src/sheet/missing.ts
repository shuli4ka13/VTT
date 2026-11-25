import { isBlank, isNoteField, livesOn, optionsOf } from '@vtt/engine';
import type { Field } from '@vtt/engine';
import type { Sheet, System } from '@vtt/schema';

export type Missing = 'pick' | null;

export function missingOf(system: System, sheet: Sheet, field: Field): Missing {
  const value = field.value;
  if (value.kind !== 'stored' || value.start || value.many || isNoteField(field) || livesOn(field) !== 'sheet') return null;
  if (Object.hasOwn(sheet.values ?? {}, field.tag) || !isBlank(value.default)) return null;
  return optionsOf(system, field).length ? 'pick' : null;
}
