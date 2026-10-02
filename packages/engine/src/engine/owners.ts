export const DESK_ID = 'стол';

export const isDesk = (sheet: { id: string }): boolean => sheet.id === DESK_ID;

export function deskField(name: string): string | null {
  const prefix = `${DESK_ID}.`;
  return name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : null;
}
