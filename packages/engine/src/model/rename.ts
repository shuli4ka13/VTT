import type { System, Compendium, Sheet, Field, Table } from './types.ts';

type Loose = Record<string, unknown>;

const NAME = '[\\p{L}\\p{N}_]';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function renameText(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [from, to] of [...map].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`@((?:отправитель|получатель|стол)\\.)?${escape(from)}(?!${NAME})`, 'gu');
    out = out.replace(re, (_, owner: string | undefined) => `@${owner ?? ''}${to}`);
  }
  return out;
}

const EXACT_KEYS = new Set(['tag', 'target', 'field']);

export function renameDeep<T>(value: T, map: Map<string, string>, key?: string): T {
  if (typeof value === 'string') {
    if (key && EXACT_KEYS.has(key) && map.has(value)) return map.get(value) as T;
    if (value.startsWith('field:') && map.has(value.slice(6))) return `field:${map.get(value.slice(6))}` as T;
    return (value.includes('@') ? renameText(value, map) : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => renameDeep(item, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, renameDeep(v, map, k)])) as T;
  }
  return value;
}

export const renameValues = <S extends Pick<Sheet, 'values'>>(sheet: S, map: Map<string, string>): S => ({
  ...sheet,
  values: Object.fromEntries(Object.entries(sheet.values ?? {}).map(([k, v]) => [map.get(k) ?? k, v])),
});

export const STATS_TABLE = 'stats';

const freeKey = (taken: string[], base: string): string => {
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
};

export const movable = (field: Field): boolean =>
  field.value.kind === 'formula' && !field.cell && !field.lives;

const statsTable = (): Table => ({
  label: 'Показатели', key: 'word',
  columns: [{ key: 'value', label: 'Значение', kind: 'number' }],
  rows: [],
  sheet: {},
});

export function statsTableOf(system: System): string {
  const fits = (table: Table | undefined) => Boolean(table?.sheet && (table.columns ?? []).some(c => c.key === 'value'));
  if (fits(system.tables?.[STATS_TABLE])) return STATS_TABLE;
  const own = Object.entries(system.tables ?? {}).find(([, table]) => table.label === 'Показатели' && fits(table));
  return own ? own[0] : freeKey(Object.keys(system.tables ?? {}), STATS_TABLE);
}

export function moveToTable(
  system: System, compendium: Compendium | null, tag: string,
): { system: System; compendium: Compendium | null; address: string } | null {
  const field = system.fields.find(f => f.tag === tag);
  if (!field || !movable(field) || field.value.kind !== 'formula') return null;
  const tableId = statsTableOf(system);
  const address = `${tableId}.${tag}.value`;
  const map = new Map([[tag, address]]);
  const tables = { ...(system.tables ?? {}) };
  const table: Table = JSON.parse(JSON.stringify(tables[tableId] ?? statsTable()));
  const selfRef = new Map([[tag, 'строка.value']]);
  (table.rows ??= []).push({
    value: tag,
    label: field.label,
    ...(field.group ? { group: field.group } : {}),
    cells: { value: { expr: field.value.expr } },
  });
  const view = { ...(field.roll ? { roll: renameDeep(field.roll, selfRef) } : {}), ...(field.control ? { control: field.control } : {}) };
  if (Object.keys(view).length) (table.sheet ??= {}).cells = { ...table.sheet?.cells, [`${tag}.value`]: view };
  tables[tableId] = table;
  for (const [id, other] of Object.entries(tables)) {
    const named = (other.columns ?? []).filter(c => c.kind === 'tag').map(c => c.key);
    if (!named.some(key => (other.rows ?? []).some(row => (row.cells ?? {})[key] === tag))) continue;
    tables[id] = {
      ...other,
      rows: (other.rows ?? []).map(row => (named.some(key => (row.cells ?? {})[key] === tag)
        ? { ...row, cells: Object.fromEntries(Object.entries(row.cells ?? {}).map(([k, v]) => [k, named.includes(k) && v === tag ? address : v])) }
        : row)),
    };
  }
  const rest = { ...system, fields: system.fields.filter(f => f.tag !== tag), tables };
  return {
    system: renameDeep(rest, map),
    compendium: compendium ? renameDeep(compendium, map) : null,
    address,
  };
}
