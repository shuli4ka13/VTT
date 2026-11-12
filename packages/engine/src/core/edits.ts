import { EngineError, isRuleError } from '../engine/errors.ts';
import { resolveRef, toolsOf } from '../engine/refs.ts';
import { compile } from '../formula/index.ts';
import { PLUS_OP } from './dice.ts';
import type { PendingAddend } from './dice.ts';
import { hasDie, dieAddend } from './dice-addend.ts';
import type { System } from '../model/types.ts';
import type { RefContext, Bound } from '../engine/refs.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { editsOf, editMatches, withValues, claimedModifiers } from '../engine/modifiers.ts';
import { stackStages } from '../engine/stages.ts';
import type { Stage } from '../model/types.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import type { Pass } from '../engine/calc.ts';
import { cancels } from '../model/cancels.ts';
import type { RollEdit, RollEditOp } from '../model/types.ts';

export const COUNT_PARAM = 'count';
export const THRESHOLD_PARAM = 'threshold';

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
  if (hasDie(op)) {
    const evaluate = (ref: unknown): unknown => compile(String((ref as { expr?: unknown }).expr ?? '')).evaluate(view.resolve, toolsOf(view.system, view, `правка броска «${label}»`));
    return dieAddend(label, view.system, op, { number: ref => Number(evaluate(ref)), text: evaluate });
  }
  const raw = (op as { value?: unknown }).value;
  const expr = raw && typeof raw === 'object' && 'expr' in raw ? String((raw as { expr: unknown }).expr) : '';
  if (!expr.trim()) throw new EngineError(`правка броска «${label}»: «прибавить» без формулы`);
  return {
    label,
    value: () => {
      let value: unknown;
      try {
        value = compile(expr).evaluate(view.resolve, toolsOf(view.system, view, `правка броска «${label}»`));
      } catch (err) {
        if (isRuleError(err)) throw new EngineError(`правка броска «${label}»: ${(err as Error).message}`);
        throw err;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new EngineError(`правка броска «${label}»: «${expr}» дала не число`);
      return value;
    },
  };
}

function bonusAddend(held: Held, system: System): PendingAddend {
  const source: unknown = held;
  if (hasDie(source)) return dieAddend(who(held), system, source, { number: ref => Number(resolveRef(ref as never, held.ref)), text: ref => resolveRef(ref as never, held.ref) });
  const op = (held as { op?: unknown }).op;
  if (op !== 'add') throw new EngineError(`правка «${who(held)}»: прибавка к броску только прибавляет, а здесь «${String(op ?? 'не задано')}»`);
  return {
    label: who(held),
    value: () => {
      try {
        return amountOf(held);
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
  const given = new Map<string, Map<string, Held>>();
  for (const mod of named) {
    const key = String(mod.edit);
    if (!dictionary[key]) throw new EngineError(`правка «${who(mod)}» ссылается на правку броска «${key}», которой нет в словаре системы`);
    const from = given.get(key) ?? new Map<string, Held>();
    const source = (mod as { source?: { type?: string; id?: string } }).source;
    const id = `${mod.view.sheet.id}\u0000${source?.type ?? ''}\u0000${source?.id ?? ''}`;
    if (!from.has(id)) from.set(id, mod);
    given.set(key, from);
  }
  const order = Object.keys(dictionary);
  const keys = [...given.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const stacks = (key: string): boolean => dictionary[key]!.stacks === true;
  const start = new Map(keys.map(key => [key, stacks(key) ? given.get(key)!.size : 1]));
  const left = new Map(start);
  for (const [at, a] of keys.entries()) {
    for (const b of keys.slice(at + 1)) {
      if (!cancels(dictionary, a, b)) continue;
      if (stacks(a) && stacks(b)) {
        const m = Math.min(left.get(a)!, left.get(b)!);
        left.set(a, left.get(a)! - m);
        left.set(b, left.get(b)! - m);
      } else {
        left.set(a, 0);
        left.set(b, 0);
      }
    }
  }
  const surviving = keys.flatMap(key => Array<string>(left.get(key)!).fill(key));
  const canceled = keys.flatMap(key => Array<string>(start.get(key)! - left.get(key)!).fill(key));
  const words = keys.flatMap(key => [...given.get(key)!.values()].slice(0, left.get(key)!).map(mod => ({
    view: mod.view, edit: withValues({ ...dictionary[key]!, label: dictionary[key]!.label || key }, mod.view),
  })));
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
      ...bonuses.map(one => bonusAddend(one, system)),
    ],
    words: surviving,
    canceled,
    counts: dice,
    bonuses: bonuses.map(who),
  };
}

export function rollMarks(holders: readonly Holder[], rollerId: string, againstId: string | null, tags: readonly string[]): string[] {
  const view = (id: string): Pass => {
    const found = holders.find(holder => holder.id === id);
    if (!found) throw new EngineError(`бросок: листа «${id}» нет среди носителей`);
    return found.view;
  };
  const names: Record<string, Bound> = { бросающий: rollerId, против: againstId };
  const marks = gather(holders, { call: ROLL_CALL, param: 'tags', tags, names, values: {}, view }).flatMap(held => {
    const raw = (held as { value?: { expr: string } }).value;
    if (!raw?.expr?.trim()) return [];
    const value = resolveRef(raw, held.ref);
    const list = Array.isArray(value) ? value : [value];
    if (list.some(one => typeof one !== 'string' || !one)) throw new EngineError(`правка «${who(held)}»: метка броска — текст, а пришло ${JSON.stringify(value)}`);
    return list as string[];
  });
  return [...new Set(marks)].filter(mark => !tags.includes(mark));
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
