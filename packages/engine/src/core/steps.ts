import { stepModule, registry } from '../engine/steps/index.ts';
import type { StepModule } from '../engine/steps/index.ts';

export type { StepContext as Ctx, StepResult as StepOut, StepData, StepModule as Runner, FieldRef } from '../engine/steps/index.ts';

export const runnerOf = (type: string): StepModule => stepModule(type);

export const calledBy = (step: { type: string }): string | null => registry.get(step.type)?.calls?.(step as never) ?? null;
