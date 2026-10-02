import { EngineError, isRuleError } from '../engine/errors.ts';
import { resolveRef } from '../engine/refs.ts';
import type { RefContext, Bound } from '../engine/refs.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { editsOf, editMatches, stackWith, withValues, claimedModifiers } from '../engine/modifiers.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import type { Pass } from '../engine/calc.ts';
import type { RollEdit } from '../model/types.ts';

export type EditMod = Extract<SourcedModifier, { kind: 'edit' }>;

export type Held = EditMod & { view: Pass; ref: RefContext };

export interface Holder {
  id: string;
  view: Pass;
}

export interface Gather {
  call: string;
  param: string;
  tags: readonly string[];
  names: Record<string, Bound>;
  values: Record<string, unknown>;
  view: (id: string) => Pass;
}

const who = (mod: SourcedModifier): string => mod.source.label || mod.source.id;

function refOf(holder: Holder, spec: Gather, owner: string): RefContext {
  return {
    pass: holder.view, owner, results: { ...spec.values, метки: [...spec.tags] },
    sheets: { bound: { ...spec.names, носитель: holder.id }, view: spec.view },
  };
}

function holds(mod: EditMod, ref: RefContext): boolean {
  const condition = (mod as { if?: { expr: string } }).if;
  if (!condition?.expr?.trim()) return true;
  let value: unknown;
  try {
    value = resolveRef(condition, ref);
  } catch (err) {
    if (isRuleError(err)) return false;
    throw err;
  }
  if (typeof value !== 'boolean') throw new EngineError(`условие правки «${condition.expr}» у «${who(mod)}» должно давать да или нет`);
  return value;
}

export function gather(holders: readonly Holder[], spec: Gather): Held[] {
  return holders.flatMap(holder => (editsOf(holder.view, spec.call, spec.param) as EditMod[])
    .filter(mod => editMatches(mod, spec.tags, holder.view.system))
    .map(mod => ({ ...mod, view: holder.view, ref: refOf(holder, spec, `правка «${who(mod)}»`) }))
    .filter(mod => holds(mod, mod.ref)));
}

export function amountOf(held: Held): number {
  const raw = (held as { value?: { expr: string } }).value;
  if (!raw?.expr?.trim()) throw new EngineError(`правка «${who(held)}»: не задано, на сколько`);
  const value = resolveRef(raw, held.ref);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(`правка «${who(held)}»: «${raw.expr}» дала не число`);
  }
  return value;
}

export function stack(held: Held[], base: number, label: string): number {
  const numbers = held.filter(mod => mod.op);
  if (!numbers.length) return base;
  return Number(stackWith(numbers, base, label, mod => amountOf(mod)));
}

export interface RollEdits {
  edits: (RollEdit & { label: string })[];
  bonus: number;
}

export function rollEdits(held: Held[], claims: readonly string[], roller: Pass, tags: readonly string[]): RollEdits {
  const system = roller.system;
  const named = [
    ...held.filter(mod => mod.edit),
    ...(claimedModifiers(system, [...claims]) as EditMod[]).map((mod): Held => ({ ...mod, view: roller, ref: { pass: roller } })),
  ];
  const dictionary = system.roll_edits || {};
  const first = new Map<string, Held>();
  for (const mod of named) {
    const key = String(mod.edit);
    if (!dictionary[key]) throw new EngineError(`правка «${who(mod)}» ссылается на правку броска «${key}», которой нет в словаре системы`);
    if (!first.has(key)) first.set(key, mod);
  }
  const keys = [...first.keys()];
  const surviving = keys.filter(key => {
    const canceledBy = dictionary[key]!.canceledBy;
    return !canceledBy || !keys.includes(canceledBy);
  });
  return {
    edits: surviving.map(key => withValues({ ...dictionary[key]!, label: dictionary[key]!.label || key }, first.get(key)!.view)),
    bonus: stack(held.filter(mod => !mod.edit), 0, tags.join(', ') || ROLL_CALL),
  };
}

export function rollHeld(holders: readonly Holder[], rollerId: string, againstId: string | null, tags: readonly string[]): Held[] {
  const view = (id: string): Pass => {
    const found = holders.find(holder => holder.id === id);
    if (!found) throw new EngineError(`бросок: листа «${id}» нет среди носителей`);
    return found.view;
  };
  const names: Record<string, Bound> = { бросающий: rollerId, против: againstId };
  const spec = (param: string): Gather => ({ call: ROLL_CALL, param, tags, names, values: {}, view });
  return [...gather(holders, spec('edits')), ...gather(holders, spec('bonus'))];
}
