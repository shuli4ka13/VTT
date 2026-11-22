import type { System, Effect, Step } from '@vtt/schema';
import { registry, lintStep } from '@vtt/engine';
import type { SlotKind, EarlierStep } from './slots.tsx';

export interface SlotSpec {
  key: string;
  label: string;
  main?: boolean;
  allow?: SlotKind[];
  required?: boolean;
  choice?: readonly (readonly [string, string])[];
  fallback?: string;
}

export const slotsOf = (type: string): SlotSpec[] | null => {
  const mod = registry.get(type);
  return mod ? ((mod.slots ?? []) as SlotSpec[]) : null;
};

export interface Problem { text: string; missingField?: string }

export function problemOf(step: Step, system: System, effect: Effect, earlier: EarlierStep[], visible: readonly { name: string; kind: string }[] = []): Problem | null {
  const problem = lintStep(step, system, effect, earlier, visible);
  if (!problem) return null;
  return { text: problem.text, ...(problem.fix?.kind === 'field' ? { missingField: problem.fix.tag } : {}) };
}
