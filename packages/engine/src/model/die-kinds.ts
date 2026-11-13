import { DICE_TEXT } from '../words/glossary.ts';
import { registry } from '../engine/steps/index.ts';
import { isBlank } from './blank.ts';
import { LADDER } from '../core/dice.ts';
import { ROLL_KINDS } from '../words/dice-kinds.ts';
import type { RollKind } from '../words/dice-kinds.ts';
import type { System, DieConstant } from './types.ts';

export type { RollKind };

export type DieShape = 'sum' | 'best' | 'hits' | 'parts';

export type RollNumber = 'bonus' | 'count' | 'sides' | 'under' | 'over';

export interface RollPlace {
  kind: RollKind | null;
  sides: readonly number[];
  roll?: string;
}

type Rule = NonNullable<System['rolls']>[string];

const readOf = (die: DieConstant): string => {
  const read = die.read as string | { kind?: string } | undefined;
  return typeof read === 'string' ? read : read?.kind ?? 'sum';
};

export function shapeOf(die: DieConstant): DieShape {
  if ((die.dice ?? []).length > 1) return 'parts';
  const read = readOf(die);
  if (read === 'count') return 'hits';
  return read === 'best' || read === 'worst' ? 'best' : 'sum';
}

const NUMBERS: Readonly<Record<DieShape, readonly RollNumber[]>> = {
  sum: ['bonus', 'under', 'over', 'count', 'sides'],
  best: ['count', 'bonus', 'under', 'over'],
  hits: ['count', 'bonus', 'over'],
  parts: ['bonus', 'under', 'over'],
};

export const numbersOf = (die: DieConstant, pair = false): readonly RollNumber[] =>
  (shapeOf(die) === 'parts' && pair ? ['sides'] : pair ? [] : NUMBERS[shapeOf(die)]);

const many = (count: unknown): boolean => (typeof count === 'number' ? count > 1 : count !== undefined && count !== null);

const kindOfDie = (die: DieConstant, counted: boolean): RollKind => {
  const shape = shapeOf(die);
  if (shape !== 'sum') return shape;
  return counted || many(die.dice?.[0]?.count) ? 'sum' : 'one';
};

const sidesOf = (die: DieConstant): number[] => (die.dice ?? []).map(term => term.sides);

const dieOf = (system: System, key: unknown): DieConstant | null => {
  const found = typeof key === 'string' ? system.constants?.[key] : undefined;
  return found && found.kind === 'die' ? found as DieConstant : null;
};

export function kindOfRule(system: System, rule: Rule): RollPlace {
  const die = dieOf(system, rule.die);
  if (!die) return { kind: null, sides: [] };
  return { kind: kindOfDie(die, (rule.number ?? 'bonus') === 'count'), sides: rule.number === 'sides' ? [] : sidesOf(die) };
}

const QUOTED = /^(["'])(.*)\1$/u;

const stepPlace = (system: System, step: Record<string, unknown>): RollPlace | null => {
  const ref = step.die;
  if (isBlank(ref)) return null;
  const counted = !isBlank(step.count) || !isBlank(step.times);
  const named = dieOf(system, ref);
  if (named) return { kind: kindOfDie(named, counted), sides: sidesOf(named) };
  const raw = typeof ref === 'string' ? ref : typeof ref === 'object' && 'expr' in (ref as object) ? String((ref as { expr: unknown }).expr) : '';
  const match = DICE_TEXT.exec(raw.trim().replace(QUOTED, '$2').trim());
  if (!match) return { kind: null, sides: [] };
  return { kind: counted || Number(match[1] ?? 1) > 1 ? 'sum' : 'one', sides: [Number(match[2])] };
};

export function placesOf(system: System): RollPlace[] {
  const out: RollPlace[] = Object.entries(system.rolls ?? {}).map(([key, rule]) => ({ ...kindOfRule(system, rule), roll: rule.label || key }));
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const step = value as Record<string, unknown>;
    if (typeof step.type === 'string' && registry.get(step.type)?.dice?.(step as never)) {
      const place = stepPlace(system, step);
      if (place) out.push(place);
    }
    Object.values(step).forEach(walk);
  };
  walk(system.effects ?? {});
  const first = system.initiative ? stepPlace(system, system.initiative as Record<string, unknown>) : null;
  if (first) out.push(first);
  return out;
}

const EVERY = ROLL_KINDS;
const NOT_HITS: readonly RollKind[] = ['one', 'sum', 'best', 'parts'];
const APART: readonly RollKind[] = ['one', 'sum', 'hits', 'parts'];

const FITS: Readonly<Record<string, readonly RollKind[]>> = {
  addDie: EVERY,
  keepBest: ['one', 'sum', 'parts'],
  keepWorst: NOT_HITS,
  wild: ['hits'],
  dieStep: NOT_HITS,
  floorDie: EVERY,
  explode: NOT_HITS,
  flip: ['one'],
  reroll: EVERY,
  plus: EVERY,
  shiftVersus: EVERY,
  shiftDegree: EVERY,
};

type Op = { op?: unknown; apart?: unknown };

const flips = (sides: number): boolean => sides >= 100 && 10 ** (String(sides).length - 1) === sides;

const SIDES: Readonly<Record<string, (sides: number) => boolean>> = {
  flip: flips,
  dieStep: sides => LADDER.includes(sides),
};

export const fitKinds = (op: Op): readonly RollKind[] =>
  (op.op === 'explode' && op.apart ? APART : FITS[String(op.op)] ?? EVERY);

export const fitsSides = (op: Op, sides: readonly number[]): boolean => {
  const need = SIDES[String(op.op)];
  return !need || !sides.length || sides.some(need);
};

export function fitsPlace(op: Op, place: RollPlace): boolean {
  if (place.kind === null) return true;
  return fitKinds(op).includes(place.kind) && fitsSides(op, place.sides);
}

export const kindsOf = (system: System): RollKind[] => {
  const found = new Set(placesOf(system).map(place => place.kind));
  return ROLL_KINDS.filter(kind => found.has(kind));
};

export function rollsCounting(system: System, dieKey: string): string[] {
  return Object.entries(system.rolls ?? {}).filter(([, rule]) => rule.die === dieKey && rule.number === 'count').map(([key, rule]) => rule.label || key);
}

export function countUnread(system: System, dieKey: string): boolean {
  const die = dieOf(system, dieKey);
  if (!die || shapeOf(die) === 'parts' || !many(die.dice?.[0]?.count)) return false;
  const rules = Object.values(system.rolls ?? {}).filter(rule => rule.die === dieKey);
  if (!rules.length || rules.some(rule => rule.number !== 'count')) return false;
  let direct = false;
  const walk = (value: unknown): void => {
    if (direct || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if ((value as { die?: unknown }).die === dieKey) { direct = true; return; }
    Object.values(value).forEach(walk);
  };
  walk({ ...system, rolls: undefined });
  return !direct;
}
