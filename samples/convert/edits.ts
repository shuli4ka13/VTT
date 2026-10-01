import { asEdits } from '../../packages/engine/src/engine/modifiers.ts';
import type { System, Modifier } from '../../packages/engine/src/model/types.ts';

type Loose = Record<string, unknown>;

const OLD = (mod: Loose): boolean =>
  (mod.kind === 'roll') || (mod.kind === 'value' && String(mod.target ?? '').startsWith('event:'));

function walk(node: unknown, system: System): unknown {
  if (Array.isArray(node)) return node.map(item => walk(item, system));
  if (!node || typeof node !== 'object') return node;
  const out: Loose = {};
  for (const [key, value] of Object.entries(node as Loose)) {
    out[key] = key === 'modifiers' && Array.isArray(value)
      ? value.flatMap((mod: Loose) => (OLD(mod) ? asEdits(system, mod as Modifier) ?? [mod] : [walk(mod, system)]))
      : walk(value, system);
  }
  return out;
}

export function editsOf(world: Loose): Loose {
  return walk(world, world.system as System) as Loose;
}
