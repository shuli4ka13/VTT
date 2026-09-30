type Loose = Record<string, any>;

const recordOf = (record: Loose): Loose => {
  const { rk, props, ...rest } = record;
  return { ...rest, ...(rk !== undefined ? { table: rk } : {}), ...(props !== undefined ? { cells: props } : {}) };
};

export function systemKinds(system: Loose): Loose {
  if (!system.records) return system;
  const tables: Loose = { ...(system.tables ?? {}) };
  const sheets: Loose = {};
  for (const [id, spec] of Object.entries(system.records as Loose)) {
    const { kind, group, props, blocks, bindings, ...rest } = spec as Loose;
    if (kind === 'sheet') {
      sheets[id] = { ...rest, ...(group !== undefined ? { block: group } : {}), ...(blocks ? { blocks } : {}) };
      continue;
    }
    if (tables[id]) throw new Error(`тип записи «${id}» и таблица «${id}» носят одно имя`);
    tables[id] = {
      ...rest, shape: 'book', use: kind,
      ...(group !== undefined ? { block: group } : {}),
      columns: props ?? [],
      ...(bindings ? { bindings } : {}),
    };
  }
  const { records: _records, ...rest } = system;
  return {
    ...rest, tables,
    ...(Object.keys(sheets).length ? { sheets } : {}),
    ...(system.library ? { library: system.library.map(recordOf) } : {}),
  };
}

export function kindsOf(world: Loose): Loose {
  return {
    ...world,
    system: systemKinds(world.system),
    ...(world.compendium ? { compendium: { ...world.compendium, records: (world.compendium.records ?? []).map(recordOf) } } : {}),
  };
}
