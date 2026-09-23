import { tagWords } from '@vtt/engine/engine/roll-tags';
import { MultiChoice } from '../../ui/multi-choice.tsx';
import type { System } from '@vtt/schema';

export function RollTagsPick({ system, value, onChange }: {
  system: System;
  value: readonly string[] | undefined;
  onChange: (next: string[]) => void;
}) {
  const options = [...tagWords(system)].map(([word, table]) => ({ value: word, label: word, group: table }));
  if (!options.length) return <span className="faint">меток нет — заведите таблицу, например «Броски»</span>;
  return <MultiChoice value={value ?? []} options={options} onChange={onChange} />;
}
