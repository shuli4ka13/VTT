import { compile } from '../formula/index.ts';
import { FormulaRuntimeError } from '../formula/errors.ts';
import { EngineError } from '../engine/errors.ts';
import { toolsOf } from '../engine/refs.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { editsOf, editMatches, stackWith, withValues, claimedModifiers, CALL_NAME } from '../engine/modifiers.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import type { Pass } from '../engine/calc.ts';
import type { RollEdit } from '../model/types.ts';

export type EditMod = Extract<SourcedModifier, { kind: 'edit' }>;

export type Held = EditMod & { view: Pass };

export interface Gather {
  call: string;
  param: string;
  as?: 'against';
  tags: readonly string[];
  args: Record<string, unknown>;
}

const who = (mod: SourcedModifier): string => mod.source.label || mod.source.id;

function evaluate(expr: string, view: Pass, args: Record<string, unknown>, owner: string): unknown {
  const prefix = `${CALL_NAME}.`;
  return compile(expr).evaluate(
    name => (name.startsWith(prefix) ? (args[name.slice(prefix.length)] ?? null) as never : view.resolve(name)),
    toolsOf(view.system, view, owner));
}

function holds(expr: string | undefined, view: Pass, args: Record<string, unknown>, mod: SourcedModifier, what: string): boolean {
  if (!expr?.trim()) return true;
  let result: unknown;
  try {
    result = evaluate(expr, view, args, what);
  } catch (err) {
    if (err instanceof FormulaRuntimeError) return false;
    throw err;
  }
  if (typeof result !== 'boolean') throw new EngineError(`${what} «${expr}» у «${who(mod)}» должно давать да или нет`);
  return result;
}

export function gather(view: Pass, spec: Gather): Held[] {
  return (editsOf(view, spec.call, spec.param, spec.as) as EditMod[])
    .filter(mod => holds((mod as { condition?: { expr: string } }).condition?.expr, view, {}, mod, 'условие правки')
      && editMatches(mod, spec.tags, view.system)
      && holds((mod as { when?: { expr: string } }).when?.expr, view, spec.args, mod, 'условие по вызову'))
    .map(mod => ({ ...mod, view }));
}

export function amountOf(held: Held, args: Record<string, unknown> = {}): number {
  const raw = (held as { value?: { expr: string } }).value;
  if (!raw?.expr?.trim()) throw new EngineError(`правка «${who(held)}»: не задано, на сколько`);
  const value = evaluate(raw.expr, held.view, args, 'правка');
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(`правка «${who(held)}»: «${raw.expr}» дала не число`);
  }
  return value;
}

export function stack(held: Held[], base: number, label: string, args: Record<string, unknown> = {}): number {
  const numbers = held.filter(mod => mod.op);
  if (!numbers.length) return base;
  return Number(stackWith(numbers, base, label, mod => amountOf(mod, args)));
}

export interface RollEdits {
  edits: (RollEdit & { label: string })[];
  bonus: number;
}

export function rollEdits(held: Held[], claims: readonly string[], roller: Pass, tags: readonly string[]): RollEdits {
  const system = roller.system;
  const named = [
    ...held.filter(mod => mod.edit),
    ...(claimedModifiers(system, [...claims]) as EditMod[]).map((mod): Held => ({ ...mod, view: roller })),
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
  const args = { метки: [...tags] };
  return {
    edits: surviving.map(key => withValues({ ...dictionary[key]!, label: dictionary[key]!.label || key }, first.get(key)!.view)),
    bonus: stack(held.filter(mod => !mod.edit), 0, tags.join(', ') || ROLL_CALL, args),
  };
}

export function rollHeld(roller: Pass, against: Pass | null, tags: readonly string[]): Held[] {
  const args = { метки: [...tags] };
  const own = (param: string) => gather(roller, { call: ROLL_CALL, param, tags, args });
  const theirs = (param: string) => (against ? gather(against, { call: ROLL_CALL, param, as: 'against', tags, args }) : []);
  return [...own('edits'), ...own('bonus'), ...theirs('edits'), ...theirs('bonus')];
}
