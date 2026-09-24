import { DESK_ID, isDesk } from '../engine/owners.ts';
import type { Sheet, System } from '../model/types.ts';

export { isDesk };

export const deskOf = (sheets: readonly Sheet[]): Sheet | null => sheets.find(isDesk) ?? null;

export const hasDesk = (system: System): boolean => system.fields.some(field => field.desk);

export const blankDesk = (system: System): Sheet =>
  ({ id: DESK_ID, systemId: system.id, name: 'Стол', values: {}, has: [], effects: [] } as Sheet);

export const deskFor = (system: System, sheets: readonly Sheet[]): Sheet | null =>
  deskOf(sheets) ?? (hasDesk(system) ? blankDesk(system) : null);
