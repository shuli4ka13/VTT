import { EngineError } from '../errors.ts';
import * as threshold from './threshold.ts';
import * as amount from './amount.ts';
import * as compare from './compare.ts';
import * as apply from './apply.ts';
import * as status from './status.ts';
import * as emit from './emit.ts';
import * as table from './table.ts';
import type { Step, System, Sheet, Die, StoredValue, Effect, WornEffect } from '../../model/types.ts';
import type { RefContext } from '../refs.ts';
import type { SourcedModifier } from '../modifiers.ts';
import type { EmittedEvent, NestedRun } from '../rule.ts';

export type StepData = Step & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StepContext extends RefContext {
  system: System;
  sheet: Sheet;
  die: Die;

  read?: (tag: string) => unknown;

  write?: (tag: string, value: StoredValue) => void;

  attach?: (id: string) => void;
  detach?: (id: string) => void;

  against?: (rollTag: string | null) => SourcedModifier[];

  claims?: string[];

  emit?: (event: EmittedEvent) => void;

  run?: (steps: Step[], seed: Record<string, unknown>, within?: string) => NestedRun;

  expiry?: (effect: Effect) => Partial<WornEffect>;

  bond?: { from: string; by: string };

  sender?: Record<string, unknown>;

  kept?: Record<string, StepData>;
  [k: string]: unknown;
}

export interface StepResult {
  value?: unknown;

  trace?: Record<string, unknown>;

  break?: { reason?: string } | null;
  [k: string]: unknown;
}

export interface StepModule {
  type: string;
  label?: string;

  slots?: unknown;
  outputs?: unknown;

  pack(step: StepData, ctx: StepContext): Record<string, unknown>;

  resolve(step: StepData, ctx: StepContext): StepResult;
  lint?: (...args: never[]) => unknown;
  traceLine?: (...args: never[]) => unknown;

  reasonWord?: (reason: string) => string | null;
  [k: string]: unknown;
}

export function breakReasonWord(type: string, reason: string): string {
  const mod = registry.get(type);
  return mod?.reasonWord?.(reason) ?? reason;
}

export const registry = new Map<string, StepModule>();

export function registerStepType(mod: StepModule): StepModule {
  for (const part of ['type', 'pack', 'resolve']) {
    if (!mod || (mod as Record<string, unknown>)[part] === undefined) {
      throw new EngineError(
        `тип шага «${mod && mod.type ? mod.type : '?'}» не годится в реестр: не хватает «${part}»`);
    }
  }
  registry.set(mod.type, mod);
  return mod;
}

for (const mod of [threshold, amount, compare, apply, status, emit, table]) {
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
