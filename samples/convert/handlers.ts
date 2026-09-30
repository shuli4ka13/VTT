type Loose = Record<string, any>;

const LISTENS = ['moment:', 'field:', 'gained:', 'lost:'];

const MOMENT: Record<string, string> = {
  'sender:before': 'acting',
  'sender:after': 'acted',
  'target:before': 'targeted',
  'target:after': 'affected',
};

export function handlerOf(handler: Loose): Loose {
  if (!('role' in handler) && !('phase' in handler) && ['acting', 'acted', 'targeted', 'affected'].includes(handler.on)) return handler;
  const { role, phase, on, ...rest } = handler;
  if (LISTENS.some(prefix => String(on).startsWith(prefix))) return { on, ...rest };
  const moment = MOMENT[`${role ?? 'target'}:${phase ?? 'after'}`];
  return { on: moment, ...(on && on !== '*' ? { of: on } : {}), ...rest };
}

export function handlersOf(world: Loose): Loose {
  const effects = Object.fromEntries(Object.entries((world.system.effects ?? {}) as Loose).map(([id, effect]) => [id, effect.on
    ? { ...effect, on: effect.on.map(handlerOf) }
    : effect]));
  return { ...world, system: { ...world.system, effects } };
}
