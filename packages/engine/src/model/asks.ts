import { actionOf } from '../events/actions.ts';
import { listOf } from './lists.ts';
import { compile } from '../formula/index.ts';
import { paymentsOf } from './payments.ts';
import { propsOf } from './owned.ts';
import { staticCell } from './tables.ts';
import type { Pass } from '../engine/calc.ts';
import { asItem, ITEM_NAME } from './item-ref.ts';
import { typeColumn } from './inherit.ts';
import { isBlank, orDefault } from './blank.ts';
import type { System, Compendium, Ask, Param } from './types.ts';

export interface AskedParam extends Param {
  ask: Ask;
  effect: string;
  effectLabel: string;
}

export function asksOf(actionId: string, { system, compendium }: { system: System; compendium: Compendium }): AskedParam[] {
  const action = actionOf(actionId, { system, compendium });
  const effect = system.effects[action.effect];
  if (!effect) return [];
  const bound = action.binding.args ?? {};
  const own = (effect.params ?? [])
    .filter((param): param is Param & { ask: Ask } => Boolean(param.ask))
    .filter(param => isBlank(bound[param.key]))
    .filter(param => askHolds(system, effect.params ?? [], bound as Record<string, unknown>, param.ask, propsOf(action.record, system) ?? {}))
    .map(param => ({ ...param, effect: action.effect, effectLabel: effect.label ?? action.effect }));
  const taken = new Set(own.map(param => param.key));
  const paid: AskedParam[] = [];
  for (const { id, payment } of paymentsOf(system, effect, bound as Record<string, unknown>)) {
    for (const asked of payment.params ?? []) {
      if (!asked.ask || taken.has(asked.key)) continue;
      taken.add(asked.key);
      paid.push({ ...(asked as Param & { ask: Ask }), effect: id, effectLabel: payment.label ?? id });
    }
  }
  return [...own, ...paid];
}

function askHolds(system: System, params: readonly Param[], bound: Record<string, unknown>, ask: Ask, props: Record<string, unknown>): boolean {
  const condition = (ask as { if?: { expr?: string } }).if?.expr;
  if (!condition?.trim()) return true;
  const literal = (key: string): unknown => {
    const arg = bound[key];
    const text = arg && typeof arg === 'object' ? (arg as { expr?: unknown }).expr : arg;
    if (isBlank(text)) return (params.find(one => one.key === key)?.default ?? null);
    try { return compile(String(text)).evaluate(name => (props[name] ?? null) as never); } catch { return null; }
  };
  const record = params.find(one => one.kind === 'record');
  const value = compile(condition).evaluate(name => {
    const item = record ? asItem(name, params) : name;
    if (item.startsWith(`${ITEM_NAME}.`)) {
      const column = item.slice(ITEM_NAME.length + 1).split('.')[0]!;
      const cell = props[column];
      return orDefault(cell, typeColumn(system, record!.from, column)) as never;
    }
    const [head, ...path] = name.split('.');
    const param = params.find(one => one.key === head);
    return staticCell(system, param?.kind === 'choice' ? param.from : undefined, literal(head!), path) as never;
  });
  return value !== false;
}

export const ASKABLE = ['number', 'choice', 'text', 'boolean'] as const;

export const askKindOf = (param: Param): 'number' | 'choice' | 'text' | 'boolean' =>
  (param.kind === 'choice' || param.kind === 'text' || param.kind === 'boolean' ? param.kind : 'number');

export const YES_NO = ['да', 'нет'] as const;

export function choicesOf(system: System, param: Param): string[] {
  return (listOf(system, param.from) ?? []).map(option => String(option.value));
}

const boundOf = (bound: unknown, actor: Pass | undefined): number | null => {
  if (isBlank(bound)) return null;
  if (typeof bound === 'number') return bound;
  if (!actor) return null;
  const text = typeof bound === 'object' ? String((bound as { expr?: unknown }).expr ?? '') : String(bound);
  if (!text.trim()) return null;
  const value = compile(text).evaluate(actor.resolve);
  return typeof value === 'number' ? value : null;
};

export type InputValue = number | string;

export type Inputs = Record<string, InputValue | Record<string, InputValue>>;

export const isPerTarget = (param: Param): boolean => Boolean((param as { perTarget?: boolean }).perTarget);

function valueProblem(param: AskedParam, value: unknown, name: string, system: System, actor: Pass | undefined): string | null {
  if (isBlank(value)) return `не заполнено: ${name}`;
  const kind = askKindOf(param);
  if (kind === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${name}: нужно число, а пришло «${String(value)}»`;
    const low = boundOf(param.min, actor);
    const high = boundOf(param.max, actor);
    if (low !== null && number < low) return `${name}: не меньше ${low}`;
    if (high !== null && number > high) return `${name}: не больше ${high}`;
  }
  if (kind === 'boolean' && !(YES_NO as readonly string[]).includes(String(value))) return `${name}: можно только «да» или «нет»`;
  if (kind === 'choice') {
    const options = choicesOf(system, param);
    if (!options.includes(String(value))) {
      return `${name}: можно только ${options.map((option: string) => `«${option}»`).join(', ') || '(список пуст)'}`;
    }
  }
  return null;
}

export function checkInputs(
  asked: AskedParam[], inputs: Inputs | undefined, system: System, actor?: Pass, targets?: readonly string[],
): string | null {
  const given = inputs ?? {};
  for (const key of Object.keys(given)) {
    if (!asked.some(param => param.key === key)) return `лишнее значение «${key}» — действие о нём не спрашивает`;
  }
  for (const param of asked) {
    const value = given[param.key];
    const name = param.label ?? param.key;
    const empty = isBlank(value);
    if (empty && param.optional && !isPerTarget(param)) continue;
    if (isPerTarget(param) && targets && !targets.length) return `${name}: спрашивается для каждой цели — сначала выберите цели`;
    if (!isPerTarget(param)) {
      if (value !== null && typeof value === 'object') return `${name}: одно значение на всё действие, а пришло по целям`;
      const problem = valueProblem(param, value, name, system, actor);
      if (problem) return problem;
      continue;
    }
    if (value === undefined || value === null || typeof value !== 'object') return `не заполнено: ${name} — для каждой цели`;
    const map = value as Record<string, InputValue>;
    for (const id of Object.keys(map)) if (targets && !targets.includes(id)) return `${name}: «${id}» — не цель этого действия`;
    for (const id of targets ?? Object.keys(map)) {
      const problem = valueProblem(param, map[id], `${name} (${id})`, system, actor);
      if (problem) return problem;
    }
  }
  return null;
}

export const normalizeInputs = (asked: AskedParam[], inputs: Inputs | undefined): Inputs => {
  const out: Inputs = {};
  const one = (param: AskedParam, value: unknown): InputValue => (askKindOf(param) === 'number' ? Number(value) : String(value));
  for (const param of asked) {
    const value = (inputs ?? {})[param.key];
    if (value === undefined) continue;
    out[param.key] = value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([id, each]) => [id, one(param, each)]))
      : one(param, value);
  }
  return out;
};
