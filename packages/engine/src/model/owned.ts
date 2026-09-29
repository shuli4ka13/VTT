import { compile } from '../formula/index.ts';
import type { Binding, Compendium, CompendiumRecord, Owned, RecordKind, Sheet, System } from './types.ts';

export const recordsOf = (compendium: Compendium | null | undefined): CompendiumRecord[] => compendium?.records ?? [];

export function withLibrary(system: System, compendium: Compendium | null | undefined): Compendium {
  const own = recordsOf(compendium);
  const ids = new Set(own.map(record => record.id));
  return { ...compendium, records: [...(system.library ?? []).filter(record => !ids.has(record.id)), ...own] };
}

export const findRecord = (compendium: Compendium | null | undefined, id: string): CompendiumRecord | undefined =>
  recordsOf(compendium).find(record => record.id === id);

export const kindOfRecord = (system: System, record: CompendiumRecord | undefined): RecordKind | undefined =>
  (record?.rk ? system.records?.[String(record.rk)] : undefined);

export const isItem = (system: System, record: CompendiumRecord | undefined): boolean =>
  kindOfRecord(system, record)?.kind === 'item';

export const entryOf = (sheet: Sheet, id: string): Owned | undefined => (sheet.has ?? []).find(entry => entry.of === id);

export const owns = (sheet: Sheet, id: string): boolean => Boolean(entryOf(sheet, id));

export interface Held { record: CompendiumRecord; entry: Owned }

export function heldBy(sheet: Sheet, compendium: Compendium | null | undefined, { all = false } = {}): Held[] {
  const out: Held[] = [];
  for (const entry of sheet.has ?? []) {
    if (entry.off && !all) continue;
    const record = findRecord(compendium, entry.of);
    if (record) out.push({ record, entry });
  }
  return out;
}

export function propsOf(record: CompendiumRecord, system: System, entry?: Owned): Record<string, unknown> | null {
  const decl = kindOfRecord(system, record);
  if (!decl?.props || !decl.props.length) return null;
  const props: Record<string, unknown> = {};
  for (const p of decl.props) {
    const own = entry?.values?.[p.key];
    if (own !== undefined) props[p.key] = own;
    else if (record.props && record.props[p.key] !== undefined) props[p.key] = record.props[p.key];
  }
  return props;
}

export const sheetKindOf = (system: System, sheet: Sheet | null | undefined): RecordKind | undefined => {
  const kind = sheet?.of ? system.records?.[sheet.of] : undefined;
  return kind?.kind === 'sheet' ? kind : undefined;
};

export const sheetKinds = (system: System): [string, RecordKind][] =>
  Object.entries(system.records ?? {}).filter(([, kind]) => kind.kind === 'sheet');

export function blockLine(system: System, block: string | undefined): string[] {
  const out: string[] = [];
  let at = block;
  while (at && !out.includes(at)) {
    out.push(at);
    at = system.groups?.[at]?.parent;
  }
  return out;
}

export function shownOn(system: System, sheet: Sheet | null | undefined): (field: { group?: string }) => boolean {
  const blocks = sheetKindOf(system, sheet)?.blocks;
  if (!blocks?.length) return () => true;
  return field => blockLine(system, field.group).some(block => blocks.includes(block));
}

export const propKeysOf = (kind: RecordKind | undefined): Set<string> => new Set((kind?.props ?? []).map(prop => prop.key));

export function argsWithProps(system: System, binding: Binding, props: ReadonlySet<string>): Binding['args'] {
  const params = system.effects[binding.effect]?.params ?? [];
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
    for (const param of system.effects[binding.effect]?.params ?? []) {
      const arg = args[param.key] as { expr?: string } | undefined;
      if (param.optional || !arg?.expr) continue;
      let deps: readonly string[];
      try { deps = compile(arg.expr).deps; } catch { continue; }
      for (const dep of deps) if (props.has(dep)) out.add(dep);
    }
  }
  return out;
}
