import { MultiCombo } from './combo.tsx';

export interface ChoiceOption { value: unknown; label: string; group?: string }

export function MultiChoice({ value, options, onChange }: {
  value: unknown;
  options: ChoiceOption[];
  onChange: (next: string[]) => void;
}) {
  const picked = Array.isArray(value) ? value.map(String) : [];
  const groups = [...new Set(options.map(o => o.group ?? ''))];
  const ordered = groups.flatMap(group => options.filter(o => (o.group ?? '') === group));
  return (
    <MultiCombo
      value={picked}
      options={ordered.map(o => ({ value: String(o.value), label: o.label, ...(o.group ? { group: o.group } : {}) }))}
      onChange={onChange}
    />
  );
}
