import type { Compendium, CompendiumRecord, Owned, RecordKind, Sheet, System } from './types.ts';

export const recordsOf = (compendium: Compendium | null | undefined): CompendiumRecord[] => compendium?.records ?? [];

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
