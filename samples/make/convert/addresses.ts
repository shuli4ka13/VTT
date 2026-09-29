type Loose = Record<string, any>;

const rowKey = (row: Loose): string => String(row.key ?? row.value ?? '');

const fillKey = (template: string, row: Loose): string =>
  template.replace(/\{key\}/g, rowKey(row)).replace(/\{value\}/g, String(row.value ?? ''));

const NAME = '[\\p{L}\\p{N}_]';

function renameText(text: string, names: [string, string][]): string {
  let out = text;
  for (const [from, to] of names) {
    const re = new RegExp(`@((?:отправитель|получатель|стол)\\.)?${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${NAME})`, 'gu');
    out = out.replace(re, (_, owner: string | undefined) => `@${owner ?? ''}${to}`);
  }
  return out;
}

const EXACT_KEYS = new Set(['tag', 'target', 'field']);

function renameDeep(value: unknown, names: [string, string][], map: Map<string, string>, key?: string): unknown {
  if (typeof value === 'string') {
    if (key && EXACT_KEYS.has(key) && map.has(value)) return map.get(value);
    if (value.startsWith('field:') && map.has(value.slice(6))) return `field:${map.get(value.slice(6))}`;
    return value.includes('@') ? renameText(value, names) : value;
  }
  if (Array.isArray(value)) return value.map(item => renameDeep(item, names, map));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Loose).map(([k, v]) => [k, renameDeep(v, names, map, k)]));
  }
  return value;
}

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
  const names = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  const system = renameDeep({ ...world.system, tables }, names, map) as Loose;
  const rekey = (sheet: Loose): Loose => ({
    ...sheet,
    values: Object.fromEntries(Object.entries(sheet.values ?? {}).map(([k, v]) => [map.get(k) ?? k, v])),
  });
  if (Array.isArray(system.mannequins)) system.mannequins = system.mannequins.map(rekey);
  const out: Loose = { ...world, system };
  if (world.compendium) out.compendium = renameDeep(world.compendium, names, map);
  if (Array.isArray(world.sheets)) out.sheets = (renameDeep(world.sheets, names, map) as Loose[]).map(rekey);
  return out;
}
