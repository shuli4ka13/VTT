export const SENDER = 'отправитель';

export const RECEIVER = 'получатель';

export type Owner = typeof SENDER | typeof RECEIVER;

export const OWNERS: readonly Owner[] = [SENDER, RECEIVER];

export function ownerOf(name: string): { owner: Owner; rest: string } | null {
  const dot = name.indexOf('.');
  if (dot <= 0) return null;
  const head = name.slice(0, dot);
  if (head !== SENDER && head !== RECEIVER) return null;
  const rest = name.slice(dot + 1);
  return rest ? { owner: head, rest } : null;
}

export const owned = (owner: Owner, name: string): string => `${owner}.${name}`;
