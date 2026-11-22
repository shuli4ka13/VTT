import { newPass, fieldsFor, startOf } from '../engine/calc.ts';
import { isDesk } from '../engine/owners.ts';
import { isBlank } from './blank.ts';
import { misfit } from './sheet-columns.ts';
import type { System, Sheet, Compendium, StoredValue } from './types.ts';

export interface FreshOptions {
  compendium?: Compendium;
  shared?: readonly Sheet[] | null;
}

const ZERO: Record<string, unknown> = { number: 0, text: '', boolean: false, choice: '' };

const empty = (value: unknown): boolean => isBlank(value) || (Array.isArray(value) && !value.length);

export function freshValues(system: System, sheet: Sheet, options: FreshOptions = {}): Record<string, StoredValue> {
  const desk = isDesk(sheet);
  const pass = newPass(system, sheet, {
    ...(options.compendium ? { compendium: options.compendium } : {}),
    shared: options.shared ?? null,
    fresh: true,
    ...(desk ? { only: 'desk' as const } : {}),
  });
  const out: Record<string, StoredValue> = {};
  for (const field of fieldsFor(system, desk ? 'desk' : 'sheet')) {
    const value = field.value;
    if (value.kind !== 'stored' || Object.hasOwn(sheet.values ?? {}, field.tag)) continue;
    let start: unknown = value.default;
    if (value.start) {
      try { start = startOf(field, pass); } catch { continue; }
    } else if (start === ZERO[value.type]) continue;
    if (empty(start) || misfit(field, start)) continue;
    out[field.tag] = start as StoredValue;
  }
  return out;
}

export interface FreshSheet {
  id: string;
  name: string;
  of?: string;
  group?: string;
}

export function freshSheet(system: System, base: FreshSheet, options: FreshOptions = {}): Sheet {
  const blank = {
    id: base.id, systemId: system.id ?? '', ...(base.of ? { of: base.of } : {}), ...(base.group ? { group: base.group } : {}),
    name: base.name, values: {}, has: [], effects: [],
  } as Sheet;
  return { ...blank, values: freshValues(system, blank, options) };
}
