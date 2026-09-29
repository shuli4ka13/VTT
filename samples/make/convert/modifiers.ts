type Loose = Record<string, any>;

const asExpr = (value: unknown): { expr: string } => {
  if (value && typeof value === 'object' && 'expr' in (value as Loose)) return { expr: String((value as Loose).expr) };
  if (typeof value === 'boolean') return { expr: value ? 'да' : 'нет' };
  if (typeof value === 'string') return { expr: JSON.stringify(value) };
  return { expr: String(value) };
};

function modifier(mod: Loose): Loose {
  const out: Loose = { ...mod };
  if (typeof out.condition === 'string' && out.condition.trim()) out.condition = { expr: out.condition };
  else if (!out.condition || typeof out.condition !== 'object') delete out.condition;
  if ('value' in out && out.value !== undefined && out.value !== null) out.value = asExpr(out.value);
  else delete out.value;
  return out;
}

const list = (mods: unknown): Loose[] | undefined => (Array.isArray(mods) ? mods.map(modifier) : undefined);

function withMods<T extends Loose>(holder: T): T {
  return holder && Array.isArray(holder.modifiers) ? { ...holder, modifiers: list(holder.modifiers) } : holder;
}

const mapValues = (o: Loose | undefined, fn: (v: Loose) => Loose): Loose | undefined =>
  (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)])) : o);

export function modifiersOf(world: Loose): Loose {
  const system = { ...world.system };
  system.effects = mapValues(system.effects, withMods);
  if (system.records) system.records = mapValues(system.records, withMods);
  if (Array.isArray(system.library)) system.library = system.library.map(withMods);
  const compendium = world.compendium && Array.isArray(world.compendium.records)
    ? { ...world.compendium, records: world.compendium.records.map(withMods) }
    : world.compendium;
  return { ...world, system, compendium };
}
