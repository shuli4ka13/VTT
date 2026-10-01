import { isActionMoment } from '../../packages/engine/src/events/bus.ts';

type Loose = Record<string, any>;

const LISTENS = ['moment:', 'field:', 'gained:', 'lost:'];

const MOMENT: Record<string, string> = {
  'sender:before': 'acting',
  'sender:after': 'acted',
  'target:before': 'targeted',
  'target:after': 'affected',
};

const isOld = (handler: Loose): boolean => {
  if ('role' in handler || 'phase' in handler) return true;
  const on = String(handler.on ?? '');
  return Boolean(on) && !isActionMoment(on) && !LISTENS.some(prefix => on.startsWith(prefix));
};

export function handlerOf(handler: Loose): Loose {
  if (!isOld(handler)) return handler;
  const { role, phase, on, ...rest } = handler;
  const moment = MOMENT[`${role ?? 'target'}:${phase ?? 'after'}`];
  return { on: moment, ...(on && on !== '*' ? { of: on } : {}), ...rest };
}

export function handlersOf(world: Loose): Loose {
  const effects = Object.fromEntries(Object.entries((world.system.effects ?? {}) as Loose).map(([id, effect]) => [id, effect.on
    ? { ...effect, on: effect.on.map(handlerOf) }
    : effect]));
  return { ...world, system: { ...world.system, effects } };
}
