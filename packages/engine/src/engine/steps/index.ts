import { EngineError } from '../errors.ts';
import * as threshold from './threshold.ts';
import * as amount from './amount.ts';
import * as compare from './compare.ts';
import * as apply from './apply.ts';
import * as status from './status.ts';
import * as emit from './emit.ts';
import * as table from './table.ts';
import * as each from './each.ts';
import * as rollAdd from './roll-add.ts';
import * as rollReroll from './roll-reroll.ts';
import * as rollPlus from './roll-plus.ts';
import type { Step, System, Die, StoredValue } from '../../model/types.ts';
import type { EmittedEvent, NestedRun } from '../rule.ts';
import type { Pass } from '../calc.ts';
import type { Roll, RollResult, Spec } from '../../core/dice.ts';
import type { Thrown } from '../../core/roll.ts';

export type StepData = Step & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StepContext {
  system: System;
  owner: string;
  die: Die;
  here: Pass;
  value(ref: unknown): unknown;
  known(ref: unknown): boolean;
  number(ref: unknown, what: string): number;
  optional(ref: unknown, what: string): number | null;
  holds(guard: unknown): boolean;
  roll(side: 'sender' | 'target', spec: Spec, tags: string[]): Thrown;
  read(tag: string): unknown;
  write(tag: string, value: StoredValue): void;
  attach(effectId: string, carry?: number): void;
  detach(effectId: string): void;
  edited(call: string, param: string, base: number, tags: string[], args: Record<string, unknown>): number;
  call(event: string, args: Record<string, unknown>, payload: EmittedEvent): NestedRun;
  reply(event: string, args: Record<string, unknown>): void;
  seenRoll?: { value: Roll };
  using(die: Die): StepContext;
}

export interface StepResult {
  value?: unknown;
  trace: Record<string, unknown>;
  break?: { reason: string; note?: string } | null;
  roll?: RollResult;
}

export interface Prepared {
  summary?: RollResult;
  [k: string]: unknown;
}

export interface StepModule {
  type: string;
  label?: string;

  slots?: unknown;
  outputs?: unknown;

  prepare?: (step: StepData, ctx: StepContext) => Prepared;

  finish(step: StepData, ctx: StepContext, prepared?: Prepared): StepResult;
  lint?: (...args: never[]) => unknown;
  traceLine?: (...args: never[]) => unknown;

  reasonWord?: (reason: string) => string | null;

  once?: (step: StepData) => boolean;

  mayBreak?: boolean;

  splits?: boolean;

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

for (const mod of [threshold, amount, compare, apply, status, emit, table, each, rollAdd, rollReroll, rollPlus]) {
  registerStepType(mod as unknown as StepModule);
}

export function stepModule(type: string): StepModule {
  const mod = registry.get(type);
  if (!mod) {
    throw new EngineError(
      `неизвестный тип шага «${type}» — реестр знает: ${[...registry.keys()].join(', ')}`);
  }
  return mod;
}
