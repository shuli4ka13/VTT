type Loose = Record<string, any>;

function column(c: Loose): Loose {
  const value = c.sheet?.value;
  if (!value) return c;
  const sheet = { ...c.sheet };
  delete sheet.value;
  if (value.kind === 'formula') return { ...c, kind: 'expr', expr: value.expr, sheet };
  return {
    ...c,
    kind: value.type ?? 'number',
    ...(value.from ? { from: value.from } : {}),
    start: value.default,
    ...(value.min !== undefined ? { min: value.min } : {}),
    ...(value.max !== undefined ? { max: value.max } : {}),
    sheet,
  };
}

export function sheetValuesOf(system: Loose): Loose {
  const tables = Object.fromEntries(Object.entries(system.tables ?? {}).map(([id, t]: [string, any]) =>
    [id, t.columns ? { ...t, columns: t.columns.map(column) } : t]));
  return system.tables ? { ...system, tables } : system;
}
