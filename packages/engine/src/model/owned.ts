import { compile } from '../formula/index.ts';
import { DESK_ID, isDesk } from '../engine/owners.ts';
import { paramsOf, basedOn } from './inherit.ts';
import type { Binding, Compendium, CompendiumRecord, Owned, Sheet, SheetKind, System, Table } from './types.ts';

export type RecordKind = Table;

export type AnyKind = Table & SheetKind;

export const isBook = (table: Table | undefined): boolean => table?.shape === 'book';

export const recordKinds = (system: System): [string, RecordKind][] =>
  Object.entries(system.tables ?? {}).filter(([, table]) => isBook(table));

export const recordKindOf = (system: System, id: string | undefined): RecordKind | undefined => {
  const table = id ? system.tables?.[id] : undefined;
  return isBook(table) ? table : undefined;
};

export const recordsOf = (compendium: Compendium | null | undefined): CompendiumRecord[] => compendium?.records ?? [];

export function withLibrary(system: System, compendium: Compendium | null | undefined): Compendium {
  const own = recordsOf(compendium);
  const ids = new Set(own.map(record => record.id));
  return { ...compendium, records: [...(system.library ?? []).filter(record => !ids.has(record.id)), ...own] };
}

export const findRecord = (compendium: Compendium | null | undefined, id: string): CompendiumRecord | undefined =>
  recordsOf(compendium).find(record => record.id === id);

export const kindOfRecord = (system: System, record: CompendiumRecord | undefined): RecordKind | undefined =>
  recordKindOf(system, record?.table);

export const isItem = (system: System, record: CompendiumRecord | undefined): boolean =>
  kindOfRecord(system, record)?.use === 'item';

export const keyOf = (entry: Owned): string => entry.id ?? entry.of;

export const entryOf = (sheet: Sheet, id: string, key?: string): Owned | undefined =>
  (sheet.has ?? []).find(entry => (key ? keyOf(entry) === key : entry.of === id));

export const owns = (sheet: Sheet, id: string): boolean => Boolean(entryOf(sheet, id));

export interface Held { record: CompendiumRecord; entry: Owned; key: string }

const keyMaps = new WeakMap<readonly Owned[], Map<string, Owned>>();

function byKeyOf(sheet: Sheet): Map<string, Owned> {
  const has = sheet.has ?? [];
  let map = keyMaps.get(has);
  if (!map) {
    map = new Map(has.map(one => [keyOf(one), one] as const));
    keyMaps.set(has, map);
  }
  return map;
}

export function working(sheet: Sheet, entry: Owned): boolean {
  const byKey = byKeyOf(sheet);
  const seen = new Set<string>();
  let at: Owned | undefined = entry;
  while (at) {
    if (at.off) return false;
    if (!at.in) return true;
    if (seen.has(keyOf(at))) return false;
    seen.add(keyOf(at));
    at = byKey.get(at.in);
    if (!at) return false;
  }
  return false;
}

export function heldBy(sheet: Sheet, compendium: Compendium | null | undefined, { all = false } = {}): Held[] {
  const out: Held[] = [];
  for (const entry of sheet.has ?? []) {
    if (!all && !working(sheet, entry)) continue;
    const record = findRecord(compendium, entry.of);
    if (record) out.push({ record, entry, key: keyOf(entry) });
  }
  return out;
}

export function isUnder(system: System, table: string | undefined, base: string): boolean {
  const seen = new Set<string>();
  let at = table;
  while (at && !seen.has(at)) {
    if (at === base) return true;
    seen.add(at);
    at = basedOn(system.tables?.[at]);
  }
  return false;
}

export function propsOf(record: CompendiumRecord, system: System, entry?: Owned): Record<string, unknown> | null {
  const decl = kindOfRecord(system, record);
  if (!decl?.columns || !decl.columns.length) return null;
  const props: Record<string, unknown> = {};
  for (const p of decl.columns) {
    const own = entry?.values?.[p.key];
    if (own !== undefined) props[p.key] = own;
    else if (record.cells && record.cells[p.key] !== undefined) props[p.key] = record.cells[p.key];
    else if (p.expr) props[p.key] = p.expr;
  }
  return props;
}

export const sheetKindOf = (system: System, sheet: Sheet | null | undefined): SheetKind | undefined =>
  (sheet?.of ? system.sheets?.[sheet.of] : sheet && isDesk(sheet) ? system.sheets?.[DESK_ID] : undefined);

export const sheetKinds = (system: System): [string, SheetKind][] =>
  Object.entries(system.sheets ?? {}).filter(([key]) => key !== DESK_ID);

export const kindsOf = (system: System): [string, AnyKind][] =>
  [...recordKinds(system), ...Object.entries(system.sheets ?? {})] as [string, AnyKind][];

export const kindOf = (system: System, id: string | undefined): AnyKind | undefined =>
  (recordKindOf(system, id) ?? (id ? system.sheets?.[id] : undefined)) as AnyKind | undefined;

export function blockLine(system: System, block: string | undefined): string[] {
  const out: string[] = [];
  let at = block;
  while (at && !out.includes(at)) {
    out.push(at);
    const name: string = at;
    at = (system.blocks ?? []).find(block => block.name === name)?.parent ?? system.groups?.[name]?.parent;
  }
  return out;
}

export function shownOn(system: System, sheet: Sheet | null | undefined): (field: { group?: string; placements?: { group: string }[] }) => boolean {
  const blocks = sheetKindOf(system, sheet)?.blocks;
  if (!blocks?.length) return () => true;
  const visible = blockShown(system, sheet);
  return field => (field.placements?.length ? field.placements.some(place => visible(place.group)) : visible(field.group));
}

export function blockShown(system: System, sheet: Sheet | null | undefined): (block: string | undefined) => boolean {
  const blocks = sheetKindOf(system, sheet)?.blocks;
  if (!blocks?.length) return () => true;
  return block => blockLine(system, block).some(name => blocks.includes(name));
}

export const propKeysOf = (kind: RecordKind | undefined): Set<string> => new Set((kind?.columns ?? []).map(prop => prop.key));

export function argsWithProps(system: System, binding: Binding, props: ReadonlySet<string>): Binding['args'] {
  const effect = system.effects[binding.effect];
  const params = effect ? paramsOf(system, effect) : [];
  const out = { ...binding.args };
  for (const param of params) {
    if (out[param.key] === undefined && props.has(param.key)) out[param.key] = { expr: `@${param.key}` };
  }
  return Object.keys(out).length ? out : undefined;
}

export function propsNeeded(system: System, kind: RecordKind | undefined, bindings: readonly Binding[]): Set<string> {
  const props = propKeysOf(kind);
  const out = new Set<string>();
  for (const binding of bindings) {
    const args = argsWithProps(system, binding, props) ?? {};
    const effect = system.effects[binding.effect];
    for (const param of effect ? paramsOf(system, effect) : []) {
      const arg = args[param.key] as { expr?: string } | undefined;
      if (param.optional || param.default !== undefined || !arg?.expr) continue;
      let deps: readonly string[];
      try { deps = compile(arg.expr).deps; } catch { continue; }
      for (const dep of deps) if (props.has(dep)) out.add(dep);
    }
  }
  return out;
}
