type Loose = Record<string, unknown>;

const pays = (step: Loose): boolean =>
  step.type === 'emit' || step.type === 'compare' || (step.type === 'apply' && step.direction === 'subtract');

function effectOf(effect: Loose): Loose {
  const { self, ...rest } = effect;
  const handlers = Array.isArray(rest.on)
    ? (rest.on as Loose[]).map(handler => {
      const { self: paid, ...own } = handler;
      return Array.isArray(paid) && paid.length ? { ...own, cost: paid } : own;
    })
    : undefined;
  const out: Loose = { ...rest, ...(handlers ? { on: handlers } : {}) };
  if (!Array.isArray(self) || !self.length) return out;
  const cut = (self as Loose[]).findIndex(step => !pays(step));
  const cost = cut < 0 ? self as Loose[] : (self as Loose[]).slice(0, cut);
  const moved = cut < 0 ? [] : (self as Loose[]).slice(cut);
  if (moved.some(pays)) throw new Error(`цена «${String(effect.label)}»: плата идёт после действий — перенести нечем`);
  const steps = (rest.steps ?? []) as Loose[];
  const split = steps.findIndex(step => step.type === 'each');
  const body = !moved.length ? steps
    : split >= 0 ? [...moved, ...steps]
      : [...moved, { type: 'each' }, ...steps];
  return { ...out, ...(cost.length ? { cost } : {}), ...(body.length ? { steps: body } : {}) };
}

export function costsOf(world: Loose): Loose {
  const system = world.system as Loose;
  const effects = Object.fromEntries(Object.entries((system.effects ?? {}) as Loose)
    .map(([id, effect]) => [id, effectOf(effect as Loose)]));
  return { ...world, system: { ...system, effects } };
}
