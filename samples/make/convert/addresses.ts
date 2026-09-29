import { renameDeep, renameValues } from '../../../packages/engine/src/model/rename.ts';

type Loose = Record<string, any>;

const rowKey = (row: Loose): string => String(row.key ?? row.value ?? '');

const fillKey = (template: string, row: Loose): string =>
  template.replace(/\{key\}/g, rowKey(row)).replace(/\{value\}/g, String(row.value ?? ''));

function table(id: string, t: Loose, map: Map<string, string>): Loose {
  const columns: Loose[] = t.columns ?? [];
  const placed = columns.some(c => c.sheet);
  const view: Loose = { columns: {} };
  const rows: Loose[] = (t.rows ?? []).map((row: Loose) => ({ ...row, cells: { ...(row.cells ?? {}) } }));
  const out: Loose[] = [];
  const own = columns.filter(c => c.sheet).map(c => [`@${c.sheet.tag}`, `@строка.${c.key}`] as [string, string])
    .sort((a, b) => b[0].length - a[0].length);
  const selfRefs = (value: unknown): unknown => {
    if (typeof value === 'string') return own.reduce((text, [from, to]) => text.split(from).join(to), value);
    if (Array.isArray(value)) return value.map(selfRefs);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, selfRefs(v)]));
    return value;
  };
  for (const column of columns) {
    const { sheet, start, ...rest } = column;
    const next: Loose = { ...rest };
    if (next.kind === 'expr') next.kind = 'number';
    if (column.kind === 'expr') {
      for (const row of rows) {
        const cell = row.cells[column.key];
        if (typeof cell === 'string' && cell.trim()) row.cells[column.key] = { expr: cell };
      }
    }
    if (sheet) {
      if (column.kind !== 'expr') for (const row of rows) delete row.cells[column.key];
      for (const row of rows) map.set(fillKey(String(sheet.tag), row), `${id}.${rowKey(row)}.${column.key}`);
      const own: Loose = {};
      if (sheet.label) own.label = sheet.label;
      if (sheet.group) own.group = sheet.group;
      if (sheet.control) own.control = sheet.control;
      if (start !== undefined) own.start = start;
      if (sheet.roll) {
        own.roll = selfRefs(sheet.roll);
      }
      view.columns[column.key] = own;
    }
    out.push(next);
  }
  for (const row of rows) if (!Object.keys(row.cells).length) delete row.cells;
  const result: Loose = { ...t, columns: out, rows };
  if (!t.columns) delete result.columns;
  if (!t.rows) delete result.rows;
  if (t.sheet?.cells) view.cells = t.sheet.cells;
  if (placed) result.sheet = view;
  else delete result.sheet;
  return result;
}

export function addressesOf(world: Loose): Loose {
  const map = new Map<string, string>();
  const tables = Object.fromEntries(Object.entries(world.system.tables ?? {}).map(([id, t]) => [id, table(id, t as Loose, map)]));
  const system = renameDeep({ ...world.system, tables }, map) as Loose;
  const rekey = (sheet: Loose): Loose => renameValues(sheet, map);
  if (Array.isArray(system.mannequins)) system.mannequins = system.mannequins.map(rekey);
  const out: Loose = { ...world, system };
  if (world.compendium) out.compendium = renameDeep(world.compendium, map);
  if (Array.isArray(world.sheets)) out.sheets = (renameDeep(world.sheets, map) as Loose[]).map(rekey);
  return out;
}
