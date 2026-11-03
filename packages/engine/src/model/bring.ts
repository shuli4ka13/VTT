import { referencesOf, formulaDeps, LISTEN } from './references.ts';
import type { Reference, Where } from './references.ts';
import { isFormulaCell, fieldsOf, fieldOf, hasField, rowKeyOf } from './sheet-columns.ts';
import type { System, Table } from './types.ts';
import { isBook, kindOf, blockLine } from './owned.ts';
import { tidyLayout } from './layout.ts';
import { tidyPages } from './pages.ts';
import type { SheetPart } from '@vtt/schema';

export type PartKind = 'field' | 'group' | 'block' | 'effect' | 'table' | 'constant' | 'rollEdit' | 'recordKind' | 'record';

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
  if (where.tab === 'book' && where.record) return { kind: 'record', key: where.record };
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
    if (from && system.tables?.[from]) out.push({ kind: isBook(system.tables[from]) ? 'recordKind' : 'table', key: from });
    for (const row of table.rows ?? []) {
      const cell = (row.cells ?? {})[column.key];
      if (isFormulaCell(cell)) {
        for (const tag of formulaDeps(cell.expr) ?? []) out.push({ kind: 'field', key: tag });
        continue;
      }
      for (const value of Array.isArray(cell) ? cell : [cell]) {
        if (typeof value !== 'string' || !value) continue;
        if (column.kind === 'effect') out.push({ kind: 'effect', key: value });
        if (column.kind === 'field') out.push({ kind: 'field', key: value });
        if (column.kind === 'table' && system.tables?.[value]) out.push({ kind: 'table', key: value });
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


export function dependencies(donor: System): (part: Part) => Part[] {
  const byOwner = new Map<string, Part[]>();
  const rows = rowTables(donor);
  for (const ref of referencesOf(donor)) {
    const owner = ownerOf(ref.from);
    if (!owner || ref.scope === LISTEN) continue;
    const has = (tag: string) => hasField(donor, tag);
    const head = ref.key.split('.')[0]!;
    const dotted = ref.kind === 'step' && has(ref.key);
    const pathed = ref.kind === 'field' && ref.key.includes('.') && !has(ref.key);
    const toTable = (pathed || (ref.kind === 'step' && !dotted)) && Boolean(donor.tables?.[head]);
    const toField = pathed && !toTable && has(head);
    const counter = ref.kind === 'field' && !has(ref.key) && Boolean(donor.effects?.[ref.key]);
    const kind = ref.kind === 'roll' || toTable ? 'table' : dotted || toField ? 'field' : counter ? 'effect' : REF_PARTS[ref.kind];
    const key = ref.kind === 'roll' ? rows.get(ref.key) : toTable || toField ? head : ref.key;
    if (!kind || !key) continue;
    const list = byOwner.get(partKey(owner)) ?? [];
    list.push({ kind, key });
    byOwner.set(partKey(owner), list);
  }

  return part => {
    const out = [...byOwner.get(partKey(part)) ?? []];
    if (part.kind === 'field') {
      const field = fieldOf(donor, part.key);
      for (const place of field?.placements ?? []) out.push({ kind: 'block', key: place.group });
      if (field?.cell) out.push({ kind: 'table', key: field.cell.table });
    }
    if (part.kind === 'table') {
      out.push(...tableDeps(donor, part.key));
      for (const field of fieldsOf(donor)) {
        if (field.cell?.table === part.key) out.push(...byOwner.get(partKey({ kind: 'field', key: field.tag })) ?? []);
      }
    }
    if (part.kind === 'rollEdit') {
      const cancel = donor.roll_edits?.[part.key]?.canceledBy;
      if (cancel) out.push({ kind: 'rollEdit', key: cancel });
    }
    if (part.kind === 'recordKind') {
      const base = (kindOf(donor, part.key) as Loose | undefined)?.extends;
      out.push(...tableDeps(donor, part.key));
      if (typeof base === 'string') out.push({ kind: 'recordKind', key: base });
    }
    if (part.kind === 'group') {
      const parent = donor.groups?.[part.key]?.parent;
      if (parent) out.push({ kind: 'group', key: parent });
    }
    if (part.kind === 'block') {
      const block = (donor.blocks ?? []).find(b => b.name === part.key);
      if (block?.parent && (donor.blocks ?? []).some(b => b.name === block.parent)) out.push({ kind: 'block', key: block.parent });
    }
    return out;
  };
}

const exists = (system: System, part: Part): boolean => {
  switch (part.kind) {
    case 'field': return hasField(system, part.key);
    case 'group': return Boolean(system.groups?.[part.key]);
    case 'block': return (system.blocks ?? []).some(block => block.name === part.key);
    case 'effect': return Boolean(system.effects?.[part.key]);
    case 'table': return Boolean(system.tables?.[part.key]);
    case 'constant': return Boolean(system.constants?.[part.key]);
    case 'rollEdit': return Boolean(system.roll_edits?.[part.key]);
    case 'recordKind': return Boolean(kindOf(system, part.key));
    case 'record': return (system.library ?? []).some(record => record.id === part.key);
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
  fieldsOf(donor)
    .filter(field => (field.placements ?? []).some(place => blockLine(donor, place.group).includes(block)))
    .map(field => ({ kind: 'field' as const, key: field.tag }));

function copyColumn(target: System, donor: System, tag: string): void {
  const field = fieldOf(donor, tag);
  if (!field || field.cell) return;
  const from = donor.tables![field.home]!;
  const column = clone((from.columns ?? []).find(c => c.key === tag)!);
  const { columns: _columns, rows: _rows, ...shell } = from;
  const home: Table = target.tables?.[field.home] ?? clone(shell);
  target.tables = { ...target.tables, [field.home]: { ...home, columns: [...home.columns ?? [], column] } };
}

function copyPart(target: System, donor: System, part: Part): void {
  switch (part.kind) {
    case 'field': copyColumn(target, donor, part.key); return;
    case 'group': (target.groups ??= {})[part.key] = clone(donor.groups![part.key]!); return;
    case 'block': return;
    case 'effect': target.effects[part.key] = clone(donor.effects[part.key]!); return;
    case 'table': target.tables = { ...target.tables, [part.key]: clone(donor.tables![part.key]!) }; return;
    case 'constant': (target.constants ??= {})[part.key] = clone(donor.constants![part.key]!); return;
    case 'rollEdit': (target.roll_edits ??= {})[part.key] = clone(donor.roll_edits![part.key]!); return;
    case 'recordKind':
      if (donor.sheets?.[part.key]) (target.sheets ??= {})[part.key] = clone(donor.sheets[part.key]!);
      else target.tables = { ...target.tables, [part.key]: clone(donor.tables![part.key]!) };
      return;
    case 'record': (target.library ??= []).push(clone(donor.library!.find(record => record.id === part.key)!)); return;
  }
}

export function bringIn(target: System, donor: System, roots: Part[], grants: string[] = []): Brought {
  const system = clone(target);
  const added: Part[] = [];
  const kept: Part[] = [];
  const parts = closure(donor, [...roots, ...grants.map(key => ({ kind: 'effect' as const, key }))]);
  const order = new Map(fieldsOf(donor).map((field, at) => [field.tag, at]));
  const had = new Set(parts.filter(part => exists(system, part)).map(partKey));
  const fields = parts.filter(p => p.kind === 'field').sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  const blocks = parts.filter(p => p.kind === 'block');
  for (const part of [...parts.filter(p => p.kind !== 'field' && p.kind !== 'block'), ...fields]) {
    if (had.has(partKey(part))) { kept.push(part); continue; }
    copyPart(system, donor, part);
    added.push(part);
  }
  const fresh = new Set<SheetPart>();
  const arrived = new Set<string>();
  for (const part of blocks) {
    const from = clone((donor.blocks ?? []).find(block => block.name === part.key)!);
    const list = (system.blocks ??= []);
    const have = list.find(block => block.name === from.name);
    const pieces = have ? from.parts.filter(piece => !have.parts.some(p => JSON.stringify(p) === JSON.stringify(piece))) : from.parts;
    for (const piece of pieces) fresh.add(piece);
    if (have) { have.parts.push(...pieces); kept.push(part); } else { list.push(from); added.push(part); arrived.add(from.name); }
  }
  for (const key of grants) {
    if (!(system.grants ?? []).includes(key)) system.grants = [...system.grants ?? [], key];
  }
  pruneBlocks(system, donor, fresh, arrived);
  tidyPages(system);
  return { system, added, kept };
}

function pruneBlocks(system: System, donor: System, fresh: Set<SheetPart>, arrived: Set<string>): void {
  if (!system.blocks || !fresh.size) return;
  for (const block of system.blocks) {
    block.parts = block.parts.flatMap(part => {
      if (!fresh.has(part)) return [part];
      const table = system.tables?.[part.table];
      if (!table) return [];
      const keys = new Set((table.columns ?? []).map(c => c.key));
      const rows = new Set((table.rows ?? []).map(r => rowKeyOf(r)));
      const missing = (donor.tables?.[part.table]?.columns ?? []).some(c => !keys.has(c.key));
      const columns = part.columns
        ? part.columns.filter(key => keys.has(key))
        : missing ? (table.columns ?? []).map(c => c.key) : undefined;
      if (columns && !columns.length) return [];
      const kept = part.rows?.filter(row => rows.has(row));
      if (kept && !kept.length) return [];
      const next: SheetPart = { table: part.table };
      if (columns) next.columns = columns;
      if (kept) next.rows = kept;
      if (part.by && keys.has(part.by)) next.by = part.by;
      return [next];
    });
  }
  const blocks = system.blocks;
  system.blocks = blocks.filter(block => !arrived.has(block.name) || block.parts.length > 0 || block.list || blocks.some(other => other.parent === block.name));
  tidyLayout(system);
}
