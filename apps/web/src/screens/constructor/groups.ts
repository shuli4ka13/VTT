import type { System } from '@vtt/schema';
import { fieldsOf, NO_BLOCK, blockNames, blockLabel } from '@vtt/engine';
import { freeId } from '../../store/world.ts';
import type { Field } from '@vtt/engine';

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
    const name = field.group ?? NO_BLOCK;
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
    ...fieldsOf(system).map(f => f.group ?? NO_BLOCK)]);
  return [...all].filter(candidate => groupChain(system, candidate).includes(name));
}

export function newGroup(system: System, base = 'Новый блок'): { key: string; title: string } {
  const shown = new Set(blockNames(system).map(other => blockLabel(system, other)));
  let title = base;
  for (let n = 2; shown.has(title); n++) title = `${base} ${n}`;
  return { key: freeId(blockNames(system), title), title };
}
