import { amountParamOf } from '../../packages/engine/src/model/lists.ts';
import type { System } from '../../packages/engine/src/model/types.ts';

type Loose = Record<string, unknown>;

const EVENT = 'event:';
const ANY_ROLL = 'roll:any';
const AGAINST = 'incoming:roll:any';

const OLD = (mod: Loose): boolean =>
  mod.kind === 'roll' || (mod.kind === 'value' && String(mod.target ?? '').startsWith(EVENT));

export function asEdits(system: System, mod: Loose): Loose[] {
  const { target, kind, ...rest } = mod;
  if (kind === 'value') {
    const call = String(target).slice(EVENT.length);
    const { tags, ...others } = rest as { tags?: string[] };
    return [{
      ...others, kind: 'edit', call, param: amountParamOf(system.effects?.[call])?.key ?? '',
      ...(tags?.length ? { anyTags: tags } : {}),
    }];
  }
  if (target !== ANY_ROLL && target !== AGAINST) throw new Error(`правка броска с мишенью «${String(target)}» — перевести нечем`);
  const as = target === AGAINST ? { as: 'against' } : {};
  const { edit, op, value, stacking, ...shared } = rest;
  return [
    ...(edit ? [{ ...shared, kind: 'edit', call: 'roll', param: 'edits', edit, ...as }] : []),
    ...(op ? [{ ...shared, kind: 'edit', call: 'roll', param: 'bonus', op, value, ...(stacking ? { stacking } : {}), ...as }] : []),
  ];
}

function walk(node: unknown, system: System): unknown {
  if (Array.isArray(node)) return node.map(item => walk(item, system));
  if (!node || typeof node !== 'object') return node;
  const out: Loose = {};
  for (const [key, value] of Object.entries(node as Loose)) {
    out[key] = key === 'modifiers' && Array.isArray(value)
      ? value.flatMap((mod: Loose) => (OLD(mod) ? asEdits(system, mod) : [walk(mod, system)]))
      : walk(value, system);
  }
  return out;
}

export function editsOf(world: Loose): Loose {
  return walk(world, world.system as System) as Loose;
}
