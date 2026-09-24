export const SENDER = 'отправитель';

export const RECEIVER = 'получатель';

export const DESK = 'стол';

export type Owner = typeof SENDER | typeof RECEIVER | typeof DESK;

export const OWNERS: readonly Owner[] = [SENDER, RECEIVER];

export const DESK_ID = 'стол';

export const isDesk = (sheet: { id: string }): boolean => sheet.id === DESK_ID;

export const OWNER_WORDS: Record<Owner, string> = { [SENDER]: 'отправителя', [RECEIVER]: 'получателя', [DESK]: 'на столе' };

export function ownerOf(name: string): { owner: Owner; rest: string } | null {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  const head = name.slice(0, dot);
  if (head !== SENDER && head !== RECEIVER && head !== DESK) return null;
  const rest = name.slice(dot + 1);
  return rest ? { owner: head, rest } : null;
}

export const owned = (owner: Owner, name: string): string => `${owner}.${name}`;
