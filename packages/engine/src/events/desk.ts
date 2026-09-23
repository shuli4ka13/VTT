import { DESK_ID } from '../engine/owners.ts';
import type { Sheet, System } from '../model/types.ts';

export const deskOf = (sheets: readonly Sheet[]): Sheet | null => sheets.find(sheet => sheet.kind === 'desk') ?? null;

export const hasDesk = (system: System): boolean => system.fields.some(field => field.desk);

export const blankDesk = (system: System): Sheet =>
  ({ id: DESK_ID, systemId: system.id, kind: 'desk', name: 'Стол', values: {}, equipped: [], effects: [], actions: [] } as Sheet);

export const deskFor = (system: System, sheets: readonly Sheet[]): Sheet | null =>
  deskOf(sheets) ?? (hasDesk(system) ? blankDesk(system) : null);
