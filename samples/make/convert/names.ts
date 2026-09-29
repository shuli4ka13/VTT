type Loose = Record<string, any>;

function effect(e: Loose): Loose {
  const out: Loose = { ...e };
  if ('stacking' in out) { out.reapply = out.stacking; delete out.stacking; }
  if (Array.isArray(out.on)) {
    out.on = out.on.map((h: Loose) => {
      if (!('ask' in h)) return h;
      const { ask, ...rest } = h;
      return ask ? { ...rest, confirm: true } : rest;
    });
  }
  return out;
}

export function namesOf(world: Loose): Loose {
  const effects = Object.fromEntries(Object.entries(world.system.effects ?? {}).map(([k, v]) => [k, effect(v as Loose)]));
  return { ...world, system: { ...world.system, effects } };
}
