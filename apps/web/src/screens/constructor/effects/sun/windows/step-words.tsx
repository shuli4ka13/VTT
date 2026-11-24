import type { System, Effect, Step } from '@vtt/schema';
import { Readback } from '../../cards/group-card.tsx';
import { groupSteps } from '../../../cards.ts';
import { stepNames, fieldedOf } from '../../../slots.tsx';
import { titleOf } from '../../words.ts';
import { linesOf } from '../../what-next.tsx';
import { formulaWords } from '../../../../../ui/formula-words.ts';

export function namesBefore(system: System, effect: Effect, chain: readonly Step[], upTo: number): Map<string, string> {
  const earlier = chain.slice(0, Math.max(0, upTo)).map(step => ({
    id: String(step.id ?? ''), ...(step.label ? { label: step.label } : {}), type: step.type, ...fieldedOf(system, effect.params ?? [], step),
    title: titleOf(groupSteps([step])[0]?.kind ?? '', step, system),
  })).filter(step => step.id);
  return stepNames({ system, effect, earlier });
}

export const exprOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'expr' in value) return String((value as { expr: unknown }).expr ?? '');
  return null;
};

export const wordsOf = (system: System, value: unknown, names: ReadonlyMap<string, string>): string => {
  const source = exprOf(value);
  return source === null || source.trim() === '' ? '' : formulaWords(system, source, names);
};

export function StepWords({ system, effect, steps, names }: {
  system: System;
  effect: Effect;
  steps: Step[];
  names: Map<string, string>;
}) {
  const cards = groupSteps(steps);
  return (
    <div className="sunw__words">
      {cards.map((card, index) => (
        <div key={index} className="sunw__word">
          <span className="sunw__word-name">{titleOf(card.kind, card.step, system)}</span>
          <Readback segments={linesOf(card.kind, card.step, card.amount, system, effect, names)} />
        </div>
      ))}
    </div>
  );
}
