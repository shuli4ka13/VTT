import { EngineError } from '../engine/errors.ts';
import { entryOf, findRecord, kindOfRecord, keyOf } from './owned.ts';
import type { Compendium, Owned, Sheet, System } from './types.ts';

export const ITEM_NAME = 'вещь';

const ITEM_TAG = `${ITEM_NAME}:`;

export interface ItemRef { sheet: string; key: string; record: string }

export const itemTag = (key: string, column: string): string => `${ITEM_TAG}${key}.${column}`;

export function parseItemTag(tag: string): { key: string; column: string } | null {
  if (!tag.startsWith(ITEM_TAG)) return null;
  const rest = tag.slice(ITEM_TAG.length);
  const dot = rest.lastIndexOf('.');
  return dot > 0 ? { key: rest.slice(0, dot), column: rest.slice(dot + 1) } : null;
}

export function itemEntry(sheet: Sheet, key: string): Owned {
  const entry = (sheet.has ?? []).find(one => keyOf(one) === key);
  if (!entry) throw new EngineError(`у листа «${sheet.name}» нет вещи «${key}»`);
  return entry;
}

export function itemColumn(system: System, compendium: Compendium | null | undefined, sheet: Sheet, key: string, column: string): string {
  const entry = itemEntry(sheet, key);
  const record = findRecord(compendium, entry.of);
  const kind = kindOfRecord(system, record);
  if (!record || !kind) throw new EngineError(`вещи «${key}» нет в книге`);
  if (!(kind.columns ?? []).some(c => c.key === column)) {
    throw new EngineError(`у типа «${kind.label || record.table}» нет колонки «${column}» — у вещи «${record.label}» её не поменять`);
  }
  return itemTag(key, column);
}

export function itemStored(compendium: Compendium | null | undefined, sheet: Sheet, key: string, column: string): unknown {
  const entry = itemEntry(sheet, key);
  if (entry.values && column in entry.values) return entry.values[column];
  return findRecord(compendium, entry.of)?.cells?.[column];
}

export function withItemValue(sheet: Sheet, key: string, column: string, value: unknown): Sheet {
  return {
    ...sheet,
    has: (sheet.has ?? []).map(one => (keyOf(one) === key ? { ...one, values: { ...(one.values ?? {}), [column]: value } } : one)) as Owned[],
  };
}

export const entryByKey = (sheet: Sheet, record: string, key: string | undefined): Owned | undefined =>
  key ? (sheet.has ?? []).find(one => keyOf(one) === key) : entryOf(sheet, record);
