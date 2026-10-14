import { namesAt, sheetNamesAt } from '@vtt/engine/model/names-at';
import type { NameAt } from '@vtt/engine/model/names-at';
import type { Place } from '@vtt/engine/model/names-at';
import type { SheetNames } from '../../../ui/formula-chips.tsx';
import type { System } from '@vtt/schema';
import { onSheet } from '@vtt/engine/model/sheet-columns';

const childLabel = (one: NameAt, label: string): string => {
  if (one.kind !== 'result') return `${one.label} → ${label}`;
  const name = one.name.replace(/_/g, ' ');
  return name.toLowerCase() === label.toLowerCase() ? name : `${name} — ${label}`;
};

export function labelsOf(names: readonly NameAt[], system?: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const one of names) {
    if (!out.has(one.name)) out.set(one.name, one.label);
    for (const child of one.children ?? []) {
      const key = `${one.name}${child.path}`;
      if (!out.has(key)) out.set(key, childLabel(one, child.label));
    }
  }
  const sheets = names.filter(one => one.kind === 'sheet' && !one.many);
  for (const row of names) {
    if (!row.from || !onSheet(system?.tables?.[row.from])) continue;
    for (const sheet of sheets) {
      for (const child of row.children ?? []) {
        const key = `${sheet.name}.${row.name}${child.path}`;
        if (!out.has(key)) out.set(key, `${childLabel(row, child.label)} (${sheet.name})`);
      }
    }
  }
  return out;
}

export const placeNamesAt = (system: System, id: string, place: Place): Map<string, string> => labelsOf(namesAt(system, id, place), system);

export const sheetsAt = (system: System, id: string, place: Place): SheetNames =>
  new Map(sheetNamesAt(system, id, place).map(one => [one.name, one.label]));
