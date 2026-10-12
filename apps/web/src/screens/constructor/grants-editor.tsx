import type { System } from '@vtt/schema';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import { calledOf, isPipeline } from '@vtt/engine/engine/effects';

export function GrantsEditor({ system, value, onChange, except, hanging = false }: {
  system: System;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  except?: string;
  hanging?: boolean;
}) {
  const called = new Set(calledOf(system).map(([key]) => key));
  const options = Object.entries(system.effects)
    .filter(([key, effect]) => key !== except && !called.has(key) && !(hanging && isPipeline(effect)))
    .map(([key, effect]) => ({ value: key, label: effect.label || key, group: isPipeline(effect) ? 'кнопки' : 'висят' }));
  return <MultiChoice value={value ?? []} options={options} onChange={next => onChange(next.length ? next : undefined)} />;
}
