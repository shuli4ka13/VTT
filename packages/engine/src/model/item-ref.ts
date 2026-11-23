import { EngineError } from '../engine/errors.ts';
import { entryOf, findRecord, kindOfRecord, keyOf, propsOf } from './owned.ts';
import { isFormulaCell, itemExpr, storedValueOf, withRecord, ITEM_NAME } from './sheet-columns.ts';
import { flattenSystem, typeColumn, typeColumns } from './inherit.ts';
import { isBlank, fixedDefault } from './blank.ts';
import { kindWord } from '../words/kinds.ts';
import type { Compendium, Field, Owned, Sheet, System, TableColumn } from './types.ts';

export { ITEM_NAME };

const ITEM_TAG = `${ITEM_NAME}:`;

export interface ItemRef { sheet: string; key: string; record: string }

export function asItem(name: string, params: readonly { key: string; kind?: string }[] | undefined): string {
  const alias = (params ?? []).find(param => param.kind === 'record')?.key;
  if (!alias) return name;
  if (name === alias) return ITEM_NAME;
  return name.startsWith(`${alias}.`) ? `${ITEM_NAME}${name.slice(alias.length)}` : name;
}

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

export function itemStored(
  system: System, compendium: Compendium | null | undefined, sheet: Sheet, key: string, column: string, count: (expr: string) => unknown,
): unknown {
  const entry = itemEntry(sheet, key);
  const record = findRecord(compendium, entry.of);
  if (!record?.table) return entry.values?.[column];
  const cells = propsOf(record, system, entry) ?? {};
  const value = cells[column];
  return isFormulaCell(value) ? count(itemExpr(system, record.table, cells, column, key)) : value;
}

export function withItemValue(sheet: Sheet, key: string, column: string, value: unknown): Sheet {
  return {
    ...sheet,
    has: (sheet.has ?? []).map(one => (keyOf(one) === key ? { ...one, values: { ...(one.values ?? {}), [column]: value } } : one)) as Owned[],
  };
}

export function withoutItemValue(sheet: Sheet, key: string, column: string): Sheet {
  return {
    ...sheet,
    has: (sheet.has ?? []).map(one => {
      if (keyOf(one) !== key || !one.values || !Object.hasOwn(one.values, column)) return one;
      const { [column]: _gone, ...rest } = one.values;
      void _gone;
      const { values: _values, ...bare } = one;
      void _values;
      return Object.keys(rest).length ? { ...one, values: rest } : bare;
    }) as Owned[],
  };
}

const TABLE_KINDS: ReadonlySet<string> = new Set(['number', 'text', 'boolean', 'choice']);

export interface ItemCell { tag: string; field: Field; value: unknown; plain: unknown }

function cellOf(system: System, compendium: Compendium | null | undefined, sheet: Sheet, key: string, column: string): ItemCell | string {
  const entry = (sheet.has ?? []).find(one => keyOf(one) === key);
  if (!entry) return `у листа «${sheet.name}» нет вещи «${key}»`;
  const record = findRecord(compendium, entry.of);
  if (!record?.table || !kindOfRecord(system, record)) return `вещи «${key}» нет в книге`;
  const table = record.table;
  const name = record.label || record.id;
  const spec = typeColumn(system, table, column);
  if (!spec) return `у типа «${system.tables?.[table]?.label || table}» нет колонки «${column}» — у вещи «${name}» её не поменять`;
  const label = spec.label || spec.key;
  if (spec.onSheet === false) return `«${label}» у вещи «${name}» на листе не показывается — за столом её не меняют`;
  const kind = spec.kind ?? 'number';
  if (!TABLE_KINDS.has(kind)) return `«${label}» у вещи «${name}» — ${kindWord(kind)}: это правило записи, за столом его не вписывают`;
  const own = record.cells?.[column];
  if (spec.expr !== undefined || isFormulaCell(own)) return `«${label}» у вещи «${name}» считается по правилу — вписать значение нельзя`;
  const book = isBlank(own) ? fixedDefault(spec) ?? null : own;
  const cells = propsOf(record, system, entry) ?? {};
  const flat = flattenSystem(system, true);
  const bound = (raw: TableColumn['min']): TableColumn['min'] =>
    (isFormulaCell(raw) ? { expr: withRecord(flat, table, cells, raw.expr, key) } : raw);
  let limits: Pick<TableColumn, 'min' | 'max'>;
  try {
    limits = { ...(spec.min !== undefined ? { min: bound(spec.min) } : {}), ...(spec.max !== undefined ? { max: bound(spec.max) } : {}) };
  } catch (err) {
    if (err instanceof EngineError) return `«${label}» у вещи «${name}»: граница не считается — ${err.message}`;
    throw err;
  }
  const value = storedValueOf({ ...spec, ...limits }, book);
  const plain = value.kind === 'stored' ? value.default : book;
  const given = entry.values?.[column];
  const tag = itemTag(key, column);
  return { tag, field: { tag, label, home: table, value, ...(spec.hint ? { hint: spec.hint } : {}), ...(spec.kind === 'dice' ? { dice: true as const } : {}) }, value: isBlank(given) ? plain : given, plain };
}

export function itemCell(system: System, compendium: Compendium | null | undefined, sheet: Sheet, key: string, column: string): ItemCell {
  const cell = cellOf(system, compendium, sheet, key, column);
  if (typeof cell === 'string') throw new EngineError(cell);
  return cell;
}

export function itemCells(system: System, compendium: Compendium | null | undefined, sheet: Sheet, key: string): ItemCell[] {
  const entry = (sheet.has ?? []).find(one => keyOf(one) === key);
  const record = entry ? findRecord(compendium, entry.of) : undefined;
  if (!record?.table) return [];
  return typeColumns(system, record.table)
    .map(spec => cellOf(system, compendium, sheet, key, spec.key))
    .filter((cell): cell is ItemCell => typeof cell !== 'string');
}

export const entryByKey = (sheet: Sheet, record: string, key: string | undefined): Owned | undefined =>
  key ? (sheet.has ?? []).find(one => keyOf(one) === key) : entryOf(sheet, record);
