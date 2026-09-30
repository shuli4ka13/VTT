import type { System } from '@vtt/schema';
import type { Field } from '@vtt/engine/model/types';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

export interface GroupNode {
  name: string;
  fields: Field[];
  children: GroupNode[];
}

export function groupChain(system: System, name: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = name;
  while (current !== undefined && !chain.includes(current)) {
    chain.push(current);
    current = system.groups?.[current]?.parent;
  }
  return chain;
}

export function groupTree(system: System): GroupNode[] {
  const byName = new Map<string, Field[]>();
  const order: string[] = [];
  const remember = (name: string) => {
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
  };
  for (const name of Object.keys(system.groups ?? {})) remember(name);
  for (const field of fieldsOf(system)) {
    const name = field.group ?? 'Без блока';
    remember(name);
    byName.get(name)!.push(field);
  }
  const nodes = new Map<string, GroupNode>();
  for (const name of order) nodes.set(name, { name, fields: byName.get(name)!, children: [] });

  const roots: GroupNode[] = [];
  for (const name of order) {
    const node = nodes.get(name)!;
    const parent = system.groups?.[name]?.parent;
    const cyclic = parent !== undefined && groupChain(system, parent).includes(name);
    if (parent !== undefined && !cyclic && nodes.has(parent)) {
      nodes.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function subtreeNames(system: System, name: string): string[] {
  const all = new Set([...Object.keys(system.groups ?? {}),
    ...fieldsOf(system).map(f => f.group ?? 'Без блока')]);
  return [...all].filter(candidate => groupChain(system, candidate).includes(name));
}

export function renameGroup(draft: System, from: string, to: string): void {
  const clean = to.trim();
  if (!clean || clean === from) return;
  if (draft.groups) {
    const spec = draft.groups[from];
    if (spec) {
      delete draft.groups[from];
      draft.groups[clean] = spec;
    }
    for (const other of Object.values(draft.groups)) {
      if (other.parent === from) other.parent = clean;
    }
  }
  for (const table of Object.values(draft.tables ?? {})) {
    if (table.block === from) table.block = clean;
    for (const column of table.columns ?? []) if (column.block === from) column.block = clean;
    for (const row of table.rows ?? []) {
      if (row.block === from) row.block = clean;
      for (const view of Object.values(row.view ?? {})) if (view.block === from) view.block = clean;
    }
  }
  for (const kind of Object.values(draft.records ?? {})) {
    if (kind.blocks) kind.blocks = kind.blocks.map(block => (block === from ? clean : block));
  }
}

export function freeGroupName(system: System, base: string): string {
  const taken = new Set([...Object.keys(system.groups ?? {}),
    ...fieldsOf(system).map(f => f.group ?? 'Без блока')]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
