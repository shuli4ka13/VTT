import { referencesOf, formulaDeps } from './references.ts';
import type { Reference, Where } from './references.ts';
import { basedOn } from './inherit.ts';
import type { System } from './types.ts';

export type PartKind = 'field' | 'group' | 'effect' | 'table' | 'constant' | 'rollEdit' | 'recordKind';

export interface Part { kind: PartKind; key: string }

export interface Brought {
  system: System;
  added: Part[];
  kept: Part[];
}

const partKey = (part: Part): string => `${part.kind}:${part.key}`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ownerOf = (where: Where): Part | null => {
  if (where.tab === 'sheet' && where.field) return { kind: 'field', key: where.field };
  if (where.tab === 'effects' && where.effect) return { kind: 'effect', key: where.effect };
  if (where.tab === 'records' && where.kind) return { kind: 'recordKind', key: where.kind };
  return null;
};

const REF_PARTS: Partial<Record<Reference['kind'], PartKind>> = {
  field: 'field', effect: 'effect', event: 'effect', constant: 'constant',
  table: 'table', rollEdit: 'rollEdit', recordKind: 'recordKind',
};

type Loose = Record<string, unknown>;

function tableDeps(system: System, key: string): Part[] {
  const table = system.tables?.[key];
  if (!table) return [];
  const out: Part[] = [];
  for (const column of table.columns ?? []) {
    const from = column.from ? String(column.from) : '';
    if (from && system.tables?.[from]) out.push({ kind: 'table', key: from });
    if (from && system.records?.[from]) out.push({ kind: 'recordKind', key: from });
    for (const row of table.rows ?? []) {
      const cell = (row.cells ?? {})[column.key];
      for (const value of Array.isArray(cell) ? cell : [cell]) {
        if (typeof value !== 'string' || !value) continue;
        if (column.kind === 'effect') out.push({ kind: 'effect', key: value });
        if (column.kind === 'tag') out.push({ kind: 'field', key: value });
        if (column.kind === 'expr') for (const tag of formulaDeps(value) ?? []) out.push({ kind: 'field', key: tag });
      }
    }
  }
  return out;
}

function rowTables(system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, table] of Object.entries(system.tables ?? {})) {
    for (const row of table.rows ?? []) {
      if (typeof row.value === 'string' && !out.has(row.value)) out.set(row.value, key);
    }
  }
  return out;
}

function groupLine(system: System, group: string | undefined): string[] {
  const out: string[] = [];
  let at = group;
  while (at && system.groups?.[at] && !out.includes(at)) {
    out.push(at);
    at = system.groups[at]!.parent;
  }
  return out;
}

export function dependencies(donor: System): (part: Part) => Part[] {
  const byOwner = new Map<string, Part[]>();
  const rows = rowTables(donor);
  for (const ref of referencesOf(donor)) {
    const owner = ownerOf(ref.from);
    if (!owner) continue;
    const dotted = ref.kind === 'step' && donor.fields.some(f => f.tag === ref.key);
    const counter = ref.kind === 'field' && !donor.fields.some(f => f.tag === ref.key) && Boolean(donor.effects?.[ref.key]);
    const kind = ref.kind === 'roll' ? 'table' : dotted ? 'field' : counter ? 'effect' : REF_PARTS[ref.kind];
    const key = ref.kind === 'roll' ? rows.get(ref.key) : ref.key;
    if (!kind || !key) continue;
    const list = byOwner.get(partKey(owner)) ?? [];
    list.push({ kind, key });
    byOwner.set(partKey(owner), list);
  }

  return part => {
    const out = [...byOwner.get(partKey(part)) ?? []];
    if (part.kind === 'field') {
      const field = donor.fields.find(f => f.tag === part.key);
      for (const group of groupLine(donor, field?.group)) out.push({ kind: 'group', key: group });
    }
    if (part.kind === 'table') out.push(...tableDeps(donor, part.key));
    if (part.kind === 'rollEdit') {
      const cancel = donor.roll_edits?.[part.key]?.canceledBy;
      if (cancel) out.push({ kind: 'rollEdit', key: cancel });
    }
    if (part.kind === 'effect') {
      const base = basedOn(donor.effects?.[part.key]);
      if (base) out.push({ kind: 'effect', key: base });
    }
    if (part.kind === 'recordKind') {
      const base = (donor.records?.[part.key] as Loose | undefined)?.extends;
      if (typeof base === 'string') out.push({ kind: 'recordKind', key: base });
    }
    if (part.kind === 'group') {
      const parent = donor.groups?.[part.key]?.parent;
      if (parent) out.push({ kind: 'group', key: parent });
    }
    return out;
  };
}

const exists = (system: System, part: Part): boolean => {
  switch (part.kind) {
    case 'field': return system.fields.some(f => f.tag === part.key);
    case 'group': return Boolean(system.groups?.[part.key]);
    case 'effect': return Boolean(system.effects?.[part.key]);
    case 'table': return Boolean(system.tables?.[part.key]);
    case 'constant': return Boolean(system.constants?.[part.key]);
    case 'rollEdit': return Boolean(system.roll_edits?.[part.key]);
    case 'recordKind': return Boolean(system.records?.[part.key]);
  }
};

export function closure(donor: System, roots: Part[]): Part[] {
  const depsOf = dependencies(donor);
  const seen = new Set<string>();
  const out: Part[] = [];
  const queue = [...roots];
  while (queue.length) {
    const part = queue.shift()!;
    if (seen.has(partKey(part)) || !exists(donor, part)) continue;
    seen.add(partKey(part));
    out.push(part);
    queue.push(...depsOf(part));
  }
  return out;
}

export const blockParts = (donor: System, block: string): Part[] =>
  donor.fields
    .filter(field => groupLine(donor, field.group).includes(block))
    .map(field => ({ kind: 'field' as const, key: field.tag }));

function copyPart(target: System, donor: System, part: Part): void {
  switch (part.kind) {
    case 'field': target.fields.push(clone(donor.fields.find(f => f.tag === part.key)!)); return;
    case 'group': (target.groups ??= {})[part.key] = clone(donor.groups![part.key]!); return;
    case 'effect': target.effects[part.key] = clone(donor.effects[part.key]!); return;
    case 'table': (target.tables ??= {})[part.key] = clone(donor.tables![part.key]!); return;
    case 'constant': (target.constants ??= {})[part.key] = clone(donor.constants![part.key]!); return;
    case 'rollEdit': (target.roll_edits ??= {})[part.key] = clone(donor.roll_edits![part.key]!); return;
    case 'recordKind': (target.records ??= {})[part.key] = clone(donor.records![part.key]!); return;
  }
}

export function bringIn(target: System, donor: System, roots: Part[], grants: string[] = []): Brought {
  const system = clone(target);
  const added: Part[] = [];
  const kept: Part[] = [];
  const parts = closure(donor, [...roots, ...grants.map(key => ({ kind: 'effect' as const, key }))]);
  const order = new Map(donor.fields.map((field, at) => [field.tag, at]));
  const fields = parts.filter(p => p.kind === 'field').sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  for (const part of [...parts.filter(p => p.kind !== 'field'), ...fields]) {
    if (exists(system, part)) { kept.push(part); continue; }
    copyPart(system, donor, part);
    added.push(part);
  }
  for (const key of grants) {
    if (!(system.grants ?? []).includes(key)) system.grants = [...system.grants ?? [], key];
  }
  return { system, added, kept };
}
