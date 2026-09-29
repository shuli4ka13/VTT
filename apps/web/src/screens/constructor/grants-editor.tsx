import type { System } from '@vtt/schema';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import { calledOf, isPipeline } from '@vtt/engine/engine/effects';

export function GrantsEditor({ system, value, onChange, except }: {
  system: System;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  except?: string;
}) {
  const called = new Set(calledOf(system).map(([key]) => key));
  const options = Object.entries(system.effects)
    .filter(([key]) => key !== except && !called.has(key))
    .map(([key, effect]) => ({ value: key, label: effect.label || key, group: isPipeline(effect) ? 'кнопки' : 'висят' }));
  return <MultiChoice value={value ?? []} options={options} onChange={next => onChange(next.length ? next : undefined)} />;
}
