import { newPass } from '../engine/calc.ts';
import { packRule, resolveRule, MAX_CALL_DEPTH } from '../engine/rule.ts';
import { expiryOf } from '../engine/clock.ts';
import type { RuleReport } from '../engine/rule.ts';
import type { StepData } from '../engine/steps/index.ts';
import type { SourcedModifier } from '../engine/modifiers.ts';
import type { Effect, Sheet } from '../model/types.ts';
import type { WorldContext } from './envelope.ts';

export { MAX_CALL_DEPTH };

export interface Call {
  effectId: string;
  effect: Effect;
  sheet: Sheet;
  owner: string;
  args?: Record<string, unknown>;
  inputs?: Record<string, number | string>;
  props?: Record<string, unknown> | null;
  seed?: Record<string, unknown>;
  against?: (rollTag: string | null) => SourcedModifier[];
  claims?: string[];

  kept?: StepData[];
}

const keptById = (steps: StepData[]): Record<string, StepData> => {
  const out: Record<string, StepData> = {};
  steps.forEach((step, index) => { out[String(step.id ?? index)] = step; });
  return out;
};

export function packCall(call: Call, world: WorldContext): StepData[] {
  const pass = newPass(world.system, call.sheet, { compendium: world.compendium, desk: world.desk });
  return packRule(call.effect, {
    system: world.system, sheet: call.sheet, pass, die: world.die,
    params: call.args ?? {},
    ...(call.inputs ? { inputs: call.inputs } : {}),
    props: call.props ?? null,
    owner: call.owner,
    ...(call.seed ? { results: call.seed } : {}),
    ...(call.against ? { against: call.against } : {}),
    ...(call.claims?.length ? { claims: call.claims } : {}),
    ...(call.kept?.length ? { kept: keptById(call.kept) } : {}),
  });
}

export interface Run {
  sheet: Sheet;
  owner: string;
  seed?: Record<string, unknown>;
  claims?: string[];
  bond?: { from: string; by: string };
}

export function runCall(steps: StepData[], run: Run, world: WorldContext): RuleReport {
  return resolveRule(steps, {
    system: world.system, sheet: run.sheet, die: world.die,
    pass: newPass(world.system, run.sheet, { compendium: world.compendium, desk: world.desk }),
    desk: world.desk ?? null,
    ...(run.seed ? { results: run.seed } : {}),
    owner: run.owner,
    expiry: (effect: Effect) => expiryOf(effect, world.clock),
    ...(run.claims?.length ? { claims: run.claims } : {}),
    ...(run.bond ? { bond: run.bond } : {}),
  });
}
