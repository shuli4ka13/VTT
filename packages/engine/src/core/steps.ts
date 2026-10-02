import { stepModule } from '../engine/steps/index.ts';
import type { StepModule } from '../engine/steps/index.ts';

export type { StepContext as Ctx, StepResult as StepOut, StepData, StepModule as Runner, FieldRef } from '../engine/steps/index.ts';

export const runnerOf = (type: string): StepModule => stepModule(type);
