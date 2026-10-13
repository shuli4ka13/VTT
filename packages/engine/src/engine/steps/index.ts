import { EngineError } from '../errors.ts';
import * as roll from './roll.ts';
import * as check from './check.ts';
import * as apply from './apply.ts';
import * as status from './status.ts';
import * as emit from './emit.ts';
import * as table from './table.ts';
import * as each from './each.ts';
import * as rollAdd from './roll-add.ts';
import * as rollReroll from './roll-reroll.ts';
import * as rollPlus from './roll-plus.ts';
import * as rollBump from './roll-bump.ts';
import { branch, orElse, end, stop } from './flow.ts';
import type { Step, System, Die, StoredValue } from '../../model/types.ts';
import type { EmittedEvent, NestedRun } from '../rule.ts';
import type { Pass } from '../calc.ts';
import type { Roll, RollResult, Spec } from '../../core/dice.ts';
import type { Thrown } from '../../core/roll.ts';
import type { Faced } from '../../core/against.ts';

export type StepData = Step & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StepContext {
  system: System;
  owner: string;
  label: string;
  die: Die;
  here: Pass;
  value(ref: unknown): unknown;
  known(ref: unknown): boolean;
  number(ref: unknown, what: string): number;
  optional(ref: unknown, what: string): number | null;
  holds(guard: unknown): boolean;
  sheet(ref: unknown, what: string): string | null;
  numberOn(sheetId: string, ref: unknown, what: string): number;
  field(ref: unknown): FieldRef;
  view(sheetId: string): Pass;
  rolled(name: string): Record<string, unknown> | null;
  roll(spec: Spec, tags: string[], by: string | null, against: string | null, bonus?: { ref: unknown; value: number }): Thrown;
  ahead?(): string | null;
  faced?(name: string, other: unknown): Faced | null;
  read(sheetId: string, tag: string): unknown;
  write(sheetId: string, tag: string, value: StoredValue): void;
  attach(sheetId: string, effectId: string, args: Record<string, StoredValue>): void;
  detach(sheetId: string, effectId: string): void;
  edited(call: string, param: string, base: number, tags: string[], args: Record<string, unknown>): number;
  call(event: string, args: Record<string, unknown>, payload: EmittedEvent): NestedRun;
  seenRoll?: { value: Roll; bonus?: number };
  inCost?: boolean;
  using(die: Die): StepContext;
}

export interface FieldRef {
  sheet: string;
  tag: string;
}

export interface StepResult {
  value?: unknown;
  trace: Record<string, unknown>;
  break?: { reason: string; note?: string } | null;
  roll?: RollResult;
}

export interface StepModule {
  type: string;
  label?: string;

  slots?: unknown;
  outputs?: unknown;

  finish(step: StepData, ctx: StepContext): StepResult;
  lint?: (...args: never[]) => unknown;
  traceLine?: (...args: never[]) => unknown;

  reasonWord?: (reason: string) => string | null;

  mayBreak?: boolean;

  lazy?: (step: StepData) => boolean;

  loops?: boolean;

  splits?: (step: StepData) => boolean;

  rows?: (step: StepData) => { table: string; as: string } | null;

  compares?: (step: StepData) => { value: unknown; versus: unknown } | null;

  thrownBy?: (step: StepData) => unknown;

  flow?: 'open' | 'alt' | 'close';

  seen?: boolean;
  [k: string]: unknown;
}

export function breakReasonWord(type: string, reason: string): string {
  const mod = registry.get(type);
  return mod?.reasonWord?.(reason) ?? reason;
}

export const registry = new Map<string, StepModule>();

export function registerStepType(mod: StepModule): StepModule {
  for (const part of ['type', 'finish']) {
    if (!mod || (mod as Record<string, unknown>)[part] === undefined) {
      throw new EngineError(
        `тип шага «${mod && mod.type ? mod.type : '?'}» не годится в реестр: не хватает «${part}»`);
    }
  }
  registry.set(mod.type, mod);
  return mod;
}

for (const mod of [roll, check, apply, status, emit, table, each, rollAdd, rollReroll, rollPlus, rollBump]) {
  registerStepType(mod as unknown as StepModule);
}
for (const mod of [branch, orElse, end, stop]) registerStepType(mod);

export function stepModule(type: string): StepModule {
  const mod = registry.get(type);
  if (!mod) {
    throw new EngineError(
      `неизвестный тип шага «${type}» — реестр знает: ${[...registry.keys()].join(', ')}`);
  }
  return mod;
}
