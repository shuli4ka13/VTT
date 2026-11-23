export type InstanceKind = 'table' | 'column' | 'cell' | 'row' | 'block' | 'page' | 'kind';

const held = new Map<string, number>();
let last = 0;

const nameOf = (kind: InstanceKind, id: string): string => `${kind}|${id}`;

export function instanceOf(kind: InstanceKind, id: string): number {
  const name = nameOf(kind, id);
  const known = held.get(name);
  if (known !== undefined) return known;
  last += 1;
  held.set(name, last);
  return last;
}

export function followInstance(kind: InstanceKind, from: string, to: string): void {
  if (from === to) return;
  const known = held.get(nameOf(kind, from));
  held.delete(nameOf(kind, from));
  held.delete(nameOf(kind, to));
  if (known !== undefined) held.set(nameOf(kind, to), known);
}

export const columnAddress = (table: string, column: string, single: boolean): string =>
  (single ? column : `${table}.${column}`);
