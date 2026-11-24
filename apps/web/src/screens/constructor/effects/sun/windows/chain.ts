import type { SunSpan } from '@vtt/engine';
import { flowOf } from '@vtt/engine';
import type { Effect, Step } from '@vtt/schema';

export function chainOf(effect: Effect, span: SunSpan | null): Step[] {
  if (!span) return [];
  if (span.part === 'handler' || span.part === 'handler-cost') {
    const handler = effect.on?.[span.handler ?? 0];
    return ((span.part === 'handler' ? handler?.steps : handler?.cost) ?? []) as Step[];
  }
  if (span.part === 'steps' || span.part === 'cost' || span.part === 'attach' || span.part === 'detach') {
    return (effect[span.part] ?? []) as Step[];
  }
  return [];
}

export const sliceOf = (steps: Step[], span: SunSpan | null, dropOpen: boolean): Step[] =>
  (span ? steps.slice(span.from, span.to + 1) : []).filter(step => {
    const flow = flowOf(step.type);
    return !flow || (flow === 'open' && !dropOpen);
  });
