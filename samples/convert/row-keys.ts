import { renameDeep, renameValues } from '../../packages/engine/src/model/rename.ts';

type Loose = Record<string, any>;

export const slug = (value: unknown): string => String(value ?? '').replace(/[^\p{L}\p{N}_]+/gu, '_');

export function rowKeyMap(system: Loose): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, table] of Object.entries((system.tables ?? {}) as Loose)) {
    for (const row of table.rows ?? []) {
      if (row.key === undefined) continue;
      const from = `${id}.${row.key}`;
      const to = `${id}.${slug(row.value)}`;
      if (from === to) continue;
      map.set(from, to);
      for (const column of table.columns ?? []) map.set(`${from}.${column.key}`, `${to}.${column.key}`);
    }
  }
  return map;
}

export function rowKeysOf(world: Loose): Loose {
  const map = rowKeyMap(world.system);
  const tables = Object.fromEntries(Object.entries((world.system.tables ?? {}) as Loose).map(([id, table]) => [id, table.rows
    ? { ...table, rows: table.rows.map(({ key: _key, ...row }: Loose) => row) }
    : table]));
  const system = renameDeep({ ...world.system, tables }, map) as Loose;
  if (Array.isArray(system.mannequins)) system.mannequins = system.mannequins.map((sheet: Loose) => renameValues(sheet, map));
  const out: Loose = { ...world, system };
  if (world.compendium) out.compendium = renameDeep(world.compendium, map);
  if (Array.isArray(world.sheets)) out.sheets = (renameDeep(world.sheets, map) as Loose[]).map(sheet => renameValues(sheet, map));
  return out;
}
