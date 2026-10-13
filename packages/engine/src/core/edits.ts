import { EngineError, isRuleError } from '../engine/errors.ts';
import { resolveRef, toolsOf } from '../engine/refs.ts';
import { compile } from '../formula/index.ts';
import { PLUS_OP } from './dice.ts';
import type { PendingAddend } from './dice.ts';
import type { RefContext, Bound } from '../engine/refs.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { editsOf, editMatches, withValues, claimedModifiers } from '../engine/modifiers.ts';
import { stackStages } from '../engine/stages.ts';
import type { Stage } from '../model/types.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import type { Pass } from '../engine/calc.ts';
import type { RollEdit, RollEditOp } from '../model/types.ts';

export const COUNT_PARAM = 'count';

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
  rolls?: Record<string, unknown>;
  view: (id: string) => Pass;
}

const who = (mod: SourcedModifier): string => mod.source.label || mod.source.id;

function inputsOf(mod: SourcedModifier): { sheets: Record<string, Bound>; values: Record<string, unknown> } {
  const sheets: Record<string, Bound> = {};
  const values: Record<string, unknown> = {};
  for (const param of mod.source.params ?? []) {
    const value = mod.source.args?.[param.key];
    if (param.kind === 'sheet') sheets[param.key] = typeof value === 'string' ? value : null;
    else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') values[param.key] = value;
  }
  return { sheets, values };
}

function refOf(mod: SourcedModifier, holder: Holder, spec: Gather, owner: string): RefContext {
  const own = inputsOf(mod);
  return {
    pass: holder.view, owner, results: { ...own.values, ...spec.values, метки: [...spec.tags] },
    ...(spec.rolls ? { rolls: spec.rolls } : {}),
    sheets: { bound: { ...own.sheets, ...spec.names, носитель: holder.id }, view: spec.view },
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

const AGAINST_NAME = /@против(?![\p{L}\p{N}_])/u;

const unbound = (mod: SourcedModifier, spec: Gather): boolean =>
  Object.hasOwn(spec.names, 'против') && spec.names.против === null
  && AGAINST_NAME.test(JSON.stringify((mod as { value?: unknown }).value ?? ''));

export function gather(holders: readonly Holder[], spec: Gather): Held[] {
  return holders.flatMap(holder => (editsOf(holder.view, spec.call, spec.param) as EditMod[])
    .filter(mod => editMatches(mod, spec.tags, holder.view.system) && !unbound(mod, spec))
    .map(mod => ({ ...mod, view: holder.view, ref: refOf(mod, holder, spec, `правка «${who(mod)}»`) }))
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

export function stack(held: Held[], base: number, label: string, stages: readonly Stage[] = []): number {
  const numbers = held.filter(mod => mod.op);
  if (!numbers.length && !stages.length) return base;
  return Number(stackStages(numbers, base, label, mod => amountOf(mod), stages));
}

export interface RollEdits {
  edits: (RollEdit & { label: string })[];
  addends: PendingAddend[];
  words: string[];
  canceled: string[];
  counts: (RollEdit & { label: string })[];
  bonuses: string[];
}


function wordAddend(label: string, op: RollEditOp, view: Pass): PendingAddend {
  const raw = (op as { value?: unknown }).value;
  const expr = raw && typeof raw === 'object' && 'expr' in raw ? String((raw as { expr: unknown }).expr) : '';
  if (!expr.trim()) throw new EngineError(`правка броска «${label}»: «прибавить» без формулы`);
  return {
    label,
    value: die => {
      let value: unknown;
      try {
        value = compile(expr).evaluate(view.resolve, toolsOf(view.system, view, `правка броска «${label}»`, die));
      } catch (err) {
        if (isRuleError(err)) throw new EngineError(`правка броска «${label}»: ${(err as Error).message}`);
        throw err;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new EngineError(`правка броска «${label}»: «${expr}» дала не число`);
      return value;
    },
  };
}

function bonusAddend(held: Held): PendingAddend {
  const op = (held as { op?: unknown }).op;
  if (op !== 'add') throw new EngineError(`правка «${who(held)}»: прибавка к броску только прибавляет, а здесь «${String(op ?? 'не задано')}»`);
  return {
    label: who(held),
    value: die => {
      try {
        return amountOf({ ...held, ref: { ...held.ref, die } });
      } catch (err) {
        if (isRuleError(err) && !(err instanceof EngineError)) throw new EngineError(`правка «${who(held)}»: ${(err as Error).message}`);
        throw err;
      }
    },
  };
}

export function rollEdits(held: Held[], claims: readonly string[], roller: Pass): RollEdits {
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
  const words = surviving.map(key => {
    const view = first.get(key)!.view;
    return { view, edit: withValues({ ...dictionary[key]!, label: dictionary[key]!.label || key }, view) };
  });
  const dice = held.filter(mod => !mod.edit && (mod as { param?: string }).param === COUNT_PARAM).map(mod => {
    const op = (mod as { op?: unknown }).op;
    if (op !== 'add') throw new EngineError(`правка «${who(mod)}»: кубики к броску только прибавляются, а здесь «${String(op ?? 'не задано')}»`);
    const count = Math.trunc(amountOf(mod));
    return { label: who(mod), ops: [{ op: 'addDie', count }] } as RollEdit & { label: string };
  }).filter(edit => Number((edit.ops![0] as unknown as { count: number }).count) !== 0);
  const bonuses = held.filter(mod => !mod.edit && (mod as { param?: string }).param !== COUNT_PARAM);
  return {
    edits: [...dice, ...words.map(word => word.edit)],
    addends: [
      ...words.flatMap(({ edit, view }) => (edit.ops ?? []).filter(op => op.op === PLUS_OP).map(op => wordAddend(edit.label, op, view))),
      ...bonuses.map(bonusAddend),
    ],
    words: surviving,
    canceled: keys.filter(key => !surviving.includes(key)),
    counts: dice,
    bonuses: bonuses.map(who),
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
  return [...gather(holders, spec('edits')), ...gather(holders, spec('bonus')), ...gather(holders, spec(COUNT_PARAM))];
}
