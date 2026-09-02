import type { System, Field, FieldValue } from '@vtt/schema';

export interface GroupNode {
  name: string;
  fields: Field[];
  children: GroupNode[];
}

export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'stored' && b.kind === 'stored') {
    return a.type === b.type && a.default === b.default
      && (a.min ?? null) === (b.min ?? null) && (a.max ?? null) === (b.max ?? null);
  }
  if (a.kind === 'formula' && b.kind === 'formula') return a.expr.trim() === b.expr.trim();
  if (a.kind === 'table' && b.kind === 'table') return a.table === b.table && a.arg === b.arg;
  return false;
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

export function effectiveDefault(system: System, name: string | undefined): FieldValue | undefined {
  if (name === undefined) return undefined;
  for (const link of groupChain(system, name)) {
    const spec = system.groups?.[link];
    if (spec?.default) return spec.default;
  }
  return undefined;
}

export function defaultSource(system: System, name: string): string | undefined {
  for (const link of groupChain(system, name)) {
    if (system.groups?.[link]?.default) return link;
  }
  return undefined;
}

export function groupTree(system: System): GroupNode[] {
  const fieldsOf = new Map<string, Field[]>();
  const order: string[] = [];
  const remember = (name: string) => {
    if (!fieldsOf.has(name)) {
      fieldsOf.set(name, []);
      order.push(name);
    }
  };
  for (const field of system.fields) {
    const name = field.group ?? 'Без блока';
    remember(name);
    fieldsOf.get(name)!.push(field);
  }
  for (const name of Object.keys(system.groups ?? {})) remember(name);

  const nodes = new Map<string, GroupNode>();
  for (const name of order) nodes.set(name, { name, fields: fieldsOf.get(name)!, children: [] });

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
    ...system.fields.map(f => f.group ?? 'Без блока')]);
  return [...all].filter(candidate => groupChain(system, candidate).includes(name));
}

export function setGroupDefault(draft: System, name: string, next: FieldValue | undefined): void {
  const before = new Map<string, FieldValue | undefined>();
  for (const field of draft.fields) before.set(field.tag, effectiveDefault(draft, field.group ?? 'Без блока'));

  const spec = { ...draft.groups?.[name] };
  if (next) spec.default = structuredClone(next); else delete spec.default;
  (draft.groups ??= {})[name] = spec;

  for (const field of draft.fields) {
    const was = before.get(field.tag);
    const now = effectiveDefault(draft, field.group ?? 'Без блока');
    if (!now || sameValue(was, now)) continue;
    if (sameValue(field.value, was)) field.value = structuredClone(now);
  }
}

export function applyDefaultToAll(draft: System, name: string): number {
  const value = effectiveDefault(draft, name);
  if (!value) return 0;
  const inside = new Set(subtreeNames(draft, name));
  let touched = 0;
  for (const field of draft.fields) {
    if (!inside.has(field.group ?? 'Без блока')) continue;
    if (sameValue(field.value, value)) continue;
    field.value = structuredClone(value);
    touched += 1;
  }
  return touched;
}

export function renameGroup(draft: System, from: string, to: string): void {
  const clean = to.trim();
  if (!clean || clean === from) return;
  for (const field of draft.fields) {
    if ((field.group ?? 'Без блока') === from) field.group = clean;
  }
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
}

export function freeGroupName(system: System, base: string): string {
  const taken = new Set([...Object.keys(system.groups ?? {}),
    ...system.fields.map(f => f.group ?? 'Без блока')]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
