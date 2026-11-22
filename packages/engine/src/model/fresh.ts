import { fieldsFor } from '../engine/calc.ts';
import { isDesk } from '../engine/owners.ts';
import { isBlank } from './blank.ts';
import { misfit } from './sheet-columns.ts';
import type { System, Sheet, StoredValue } from './types.ts';

const ZERO: Record<string, unknown> = { number: 0, text: '', note: '', boolean: false, choice: '' };

const empty = (value: unknown): boolean => isBlank(value) || (Array.isArray(value) && !value.length);

export function freshValues(system: System, sheet: Pick<Sheet, 'id' | 'values'>): Record<string, StoredValue> {
  const out: Record<string, StoredValue> = {};
  for (const field of fieldsFor(system, isDesk(sheet) ? 'desk' : 'sheet')) {
    const value = field.value;
    if (value.kind !== 'stored' || value.start || Object.hasOwn(sheet.values ?? {}, field.tag)) continue;
    if (value.default === ZERO[value.type] || empty(value.default) || misfit(field, value.default)) continue;
    out[field.tag] = value.default as StoredValue;
  }
  return out;
}

export interface FreshSheet {
  id: string;
  name: string;
  of?: string;
  group?: string;
}

export function freshSheet(system: System, base: FreshSheet): Sheet {
  const blank = {
    id: base.id, systemId: system.id ?? '', ...(base.of ? { of: base.of } : {}), ...(base.group ? { group: base.group } : {}),
    name: base.name, values: {}, has: [], effects: [],
  } as Sheet;
  return { ...blank, values: freshValues(system, blank) };
}
