type Loose = Record<string, any>;

const ZERO: Loose = { number: 0, text: '', boolean: false, choice: '' };

const SINGLE: Record<string, { id: string; label: string }> = {
  sheet: { id: 'лист', label: 'Лист' },
  desk: { id: 'стол', label: 'Стол' },
  group: { id: 'группа', label: 'Группа' },
};

function valueBits(value: Loose): Loose {
  if (value.kind === 'formula') return { expr: value.expr };
  const out: Loose = { kind: value.type };
  if (value.from) out.from = value.from;
  if (value.default !== undefined && value.default !== ZERO[value.type]) out.default = value.default;
  if (value.min !== undefined) out.min = value.min;
  if (value.max !== undefined) out.max = value.max;
  return out;
}

function columnOf(field: Loose): Loose {
  const out: Loose = { key: field.tag, label: field.label, ...valueBits(field.value) };
  if (field.roll) out.roll = field.roll;
  if (field.control) out.control = field.control;
  if (field.group) out.block = field.group;
  return out;
}

function viewBits(view: Loose | undefined, column: boolean): Loose {
  const out: Loose = {};
  if (!view) return out;
  if (view.label !== undefined) out[column ? 'title' : 'label'] = view.label;
  if (view.group !== undefined) out.block = view.group;
  if (view.roll !== undefined) out.roll = view.roll;
  if (view.control !== undefined) out.control = view.control;
  if (view.start !== undefined) out.default = view.start;
  return out;
}

const rowKey = (row: Loose): string => String(row.key ?? row.value ?? '');

function tableOf(id: string, table: Loose, fields: Loose[]): Loose {
  const { sheet, ...rest } = table;
  const rows = (table.rows ?? []).map((row: Loose) => {
    const { group, ...own } = row;
    const next: Loose = { ...own };
    if (group !== undefined) next.block = group;
    return next;
  });
  const out: Loose = { ...rest };
  if (table.rows) out.rows = rows;
  if (!sheet) return out;

  const lives = new Set(fields.filter(f => f.cell?.table === id).map(f => f.lives ?? 'sheet'));
  if (lives.size > 1) throw new Error(`таблица «${id}»: клетки лежат у разных владельцев — ${[...lives].join(', ')}`);
  out.owner = [...lives][0] ?? 'sheet';
  if (sheet.group !== undefined) out.block = sheet.group;
  out.columns = (table.columns ?? []).map((column: Loose) => ({ ...column, ...viewBits(sheet.columns?.[column.key], true) }));
  for (const [address, view] of Object.entries(sheet.cells ?? {})) {
    const row = rows.find((r: Loose) => address.startsWith(`${rowKey(r)}.`));
    if (!row) throw new Error(`таблица «${id}»: вид клетки «${address}» — такой строки нет`);
    const column = address.slice(rowKey(row).length + 1);
    row.view = { ...row.view, [column]: viewBits(view as Loose, false) };
  }
  return out;
}

export function systemColumns(system: Loose): Loose {
  if (!Array.isArray(system.fields)) return system;
  const fields: Loose[] = system.fields;
  const taken = new Set([...Object.keys(system.tables ?? {}), ...fields.map(f => f.tag)]);
  const idOf = (holder: string): string => {
    let id = SINGLE[holder]!.id;
    while (taken.has(id)) id = `${id}_`;
    return id;
  };

  const singles: Loose = {};
  for (const holder of ['sheet', 'desk', 'group']) {
    const own = fields.filter(f => !f.cell && (f.lives ?? 'sheet') === holder);
    if (!own.length) continue;
    singles[idOf(holder)] = {
      label: SINGLE[holder]!.label,
      shape: 'single',
      ...(holder === 'sheet' ? {} : { owner: holder }),
      columns: own.map(columnOf),
    };
  }

  const tables: Loose = { ...singles };
  for (const [id, table] of Object.entries(system.tables ?? {})) tables[id] = tableOf(id, table as Loose, fields);

  const groups: Loose = {};
  const seen = (name: string | undefined) => { if (name && !(name in groups)) groups[name] = {}; };
  for (const field of fields) seen(field.group);
  for (const [name, spec] of Object.entries(system.groups ?? {})) {
    const { default: _start, ...rest } = spec as Loose;
    groups[name] = rest;
  }

  const { fields: _fields, ...rest } = system;
  return { ...rest, tables, ...(Object.keys(groups).length ? { groups } : {}) };
}

export function columnsOf(world: Loose): Loose {
  return { ...world, system: systemColumns(world.system) };
}
