import { stepModule } from '../engine/steps/index.ts';
import type { StepData, StepModule } from '../engine/steps/index.ts';

export type { StepContext as Ctx, StepResult as StepOut, Prepared, StepData, StepModule as Runner } from '../engine/steps/index.ts';

export const runnerOf = (type: string): StepModule => stepModule(type);

export const onceStep = (step: StepData): boolean => runnerOf(step.type).once?.(step) ?? false;
