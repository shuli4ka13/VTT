type Loose = Record<string, unknown>;

const freeKey = (taken: Set<string>, base: string): string => {
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
};

export function typesOf<T extends { system: Loose }>(world: T): T {
  const next = JSON.parse(JSON.stringify(world)) as T;
  const system = next.system as { fields?: Loose[]; tables?: Record<string, Loose> };
  const taken = new Set(Object.keys(system.tables ?? {}));
  for (const field of system.fields ?? []) {
    const value = field.value as Loose;
    let from = field.optionsFrom as string | undefined;
    const options = field.options as { value: unknown; label: string }[] | undefined;
    if (!from && options?.length) {
      from = freeKey(taken, `${String(field.tag)}_варианты`);
      taken.add(from);
      (system.tables ??= {})[from] = {
        label: `Варианты: ${String(field.label ?? field.tag)}`, key: 'word',
        ...(options.some(option => typeof option.value === 'number') ? { key: 'number' } : {}),
        rows: options.map(option => ({ value: option.value, ...(option.label !== String(option.value) ? { label: option.label } : {}) })),
      };
    }
    delete field.optionsFrom;
    delete field.options;
    if (from && value?.kind === 'stored') {
      value.type = 'choice';
      value.from = from;
    }
  }
  return next;
}
