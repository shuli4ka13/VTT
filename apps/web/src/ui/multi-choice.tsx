import { Chip, Select } from './primitives.tsx';

export function MultiChoice({ value, options, onChange }: {
  value: unknown;
  options: { value: unknown; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const picked = Array.isArray(value) ? value.map(String) : [];
  const labelOf = (key: string) => options.find(o => String(o.value) === key)?.label ?? key;
  const free = options.filter(o => !picked.includes(String(o.value)));

  return (
    <div className="inline inline--tight">
      {picked.map(key => (
        <Chip key={key} onRemove={() => onChange(picked.filter(other => other !== key))}>{labelOf(key)}</Chip>
      ))}
      {free.length ? (
        <Select
          value=""
          options={[['', picked.length ? '+ ещё…' : '+ добавить…'], ...free.map(o => [String(o.value), o.label] as const)] as never}
          onChange={next => { if (next) onChange([...picked, next]); }}
        />
      ) : null}
    </div>
  );
}
