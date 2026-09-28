import { DESK_ID, isDesk } from '../engine/owners.ts';
import { livesOn } from '../engine/calc.ts';
import type { Sheet, System } from '../model/types.ts';

export { isDesk };

export const deskOf = (sheets: readonly Sheet[]): Sheet | null => sheets.find(isDesk) ?? null;

export const hasDesk = (system: System): boolean => system.fields.some(field => livesOn(field) === 'desk');

export const blankDesk = (system: System): Sheet =>
  ({ id: DESK_ID, systemId: system.id, name: 'Стол', values: {}, has: [], effects: [] } as Sheet);

export const deskFor = (system: System, sheets: readonly Sheet[]): Sheet | null =>
  deskOf(sheets) ?? (hasDesk(system) ? blankDesk(system) : null);

export const isGroup = (sheet: Pick<Sheet, 'id'>, sheets: readonly Sheet[]): boolean =>
  sheets.some(other => other.group === sheet.id);

export const isShared = (sheet: Sheet, sheets: readonly Sheet[]): boolean => isDesk(sheet) || isGroup(sheet, sheets);

export function sharedOf(system: System, sheets: readonly Sheet[]): Sheet[] {
  const desk = deskFor(system, sheets);
  const groups = sheets.filter(sheet => !isDesk(sheet) && isGroup(sheet, sheets));
  return [...(desk ? [desk] : []), ...groups];
}

export function withShared<T extends Sheet>(sheets: readonly T[], updated: readonly Sheet[] | null | undefined): T[] {
  if (!updated?.length) return [...sheets];
  const known = new Set(sheets.map(s => s.id));
  return [
    ...sheets.map(sheet => (updated.find(u => u.id === sheet.id) as T | undefined) ?? sheet),
    ...updated.filter(u => !known.has(u.id)) as T[],
  ];
}

export const changedShared = (now: readonly Sheet[], before: readonly Sheet[] | null | undefined): Sheet[] =>
  now.filter(sheet => !(before ?? []).includes(sheet));
