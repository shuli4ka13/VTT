type Loose = Record<string, any>;

const literal = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
};

function asExpr(arg: unknown): Loose | null {
  if (arg === null || arg === undefined) return null;
  if (typeof arg !== 'object') return { expr: literal(arg) };
  const a = arg as Loose;
  if ('expr' in a) return { expr: String(a.expr) };
  if ('const' in a) return a.const === null ? null : { expr: literal(a.const) };
  if ('param' in a) return { expr: `@${a.param}` };
  if ('prop' in a) return { expr: `@${a.prop}` };
  if ('tag' in a) return { expr: `@${a.tag}` };
  return a;
}

function bindingArgs(binding: Loose): Loose {
  if (!binding?.args) return binding;
  const args: Loose = {};
  for (const [key, raw] of Object.entries(binding.args as Loose)) {
    if (raw && typeof raw === 'object' && 'prop' in raw && raw.prop === key) continue;
    const next = asExpr(raw);
    if (next) args[key] = next;
  }
  const { args: _, ...rest } = binding;
  return Object.keys(args).length ? { ...rest, args } : rest;
}

function step(s: Loose): Loose {
  if (!s || typeof s !== 'object') return s;
  const out: Loose = { ...s };
  if (out.type === 'emit' && out.args) {
    const args: Loose = {};
    for (const [key, raw] of Object.entries(out.args as Loose)) {
      const next = asExpr(raw);
      if (next) args[key] = next;
    }
    out.args = args;
  }
  if (out.roll?.tags) {
    out.roll = { ...out.roll, tags: out.roll.tags.map((t: unknown) => (t && typeof t === 'object' && 'param' in (t as Loose) ? { expr: `@${(t as Loose).param}` } : t)) };
  }
  return out;
}

const steps = (list: unknown): unknown => (Array.isArray(list) ? list.map(step) : list);

function effect(e: Loose): Loose {
  const out: Loose = { ...e };
  for (const key of ['steps', 'self', 'attach', 'detach']) if (out[key]) out[key] = steps(out[key]);
  if (Array.isArray(out.on)) out.on = out.on.map((h: Loose) => ({ ...h, ...(h.steps ? { steps: steps(h.steps) } : {}), ...(h.self ? { self: steps(h.self) } : {}) }));
  return out;
}

const withBindings = (holder: Loose): Loose =>
  (Array.isArray(holder?.bindings) ? { ...holder, bindings: holder.bindings.map(bindingArgs) } : holder);

function optionalInputs(world: Loose): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const note = (effect: unknown, args: unknown) => {
    for (const [key, raw] of Object.entries((args ?? {}) as Loose)) {
      if (!raw || typeof raw !== 'object' || !(raw as Loose).optional) continue;
      const set = out.get(String(effect)) ?? new Set<string>();
      set.add(key);
      out.set(String(effect), set);
    }
  };
  const holders = [
    ...Object.values(world.system.records ?? {}),
    ...(world.system.library ?? []),
    ...(world.compendium?.records ?? []),
  ] as Loose[];
  for (const holder of holders) for (const b of holder.bindings ?? []) note(b.effect, b.args);
  return out;
}

export function argsOf(world: Loose): Loose {
  const optional = optionalInputs(world);
  const system = { ...world.system };
  for (const [id, keys] of optional) {
    const effect = system.effects?.[id];
    if (!effect?.params) continue;
    system.effects = {
      ...system.effects,
      [id]: { ...effect, params: effect.params.map((p: Loose) => (keys.has(p.key) ? { ...p, optional: true } : p)) },
    };
  }
  system.effects = Object.fromEntries(Object.entries(system.effects ?? {}).map(([k, v]) => [k, effect(v as Loose)]));
  if (system.records) system.records = Object.fromEntries(Object.entries(system.records).map(([k, v]) => [k, withBindings(v as Loose)]));
  if (Array.isArray(system.library)) system.library = system.library.map(withBindings);
  const compendium = Array.isArray(world.compendium?.records)
    ? { ...world.compendium, records: world.compendium.records.map(withBindings) }
    : world.compendium;
  return { ...world, system, compendium };
}
