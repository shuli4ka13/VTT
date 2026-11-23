import { NAMES } from '../words/names.ts';
export const DESK_ID = NAMES.desk;

export const COMBAT_NAME = NAMES.combat;

export const isDesk = (sheet: { id: string }): boolean => sheet.id === DESK_ID;

export function deskField(name: string): string | null {
  const prefix = `${DESK_ID}.`;
  return name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : null;
}
