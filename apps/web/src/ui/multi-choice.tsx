import { Chip, Select } from './primitives.tsx';

export interface ChoiceOption { value: unknown; label: string; group?: string }

export function MultiChoice({ value, options, onChange }: {
  value: unknown;
  options: ChoiceOption[];
  onChange: (next: string[]) => void;
}) {
  const picked = Array.isArray(value) ? value.map(String) : [];
  const labelOf = (key: string) => options.find(o => String(o.value) === key)?.label ?? key;
  const free = options.filter(o => !picked.includes(String(o.value)));
  const prompt = picked.length ? '+ ещё…' : '+ добавить…';
  const groups = [...new Set(free.map(o => o.group).filter((g): g is string => Boolean(g)))];

  return (
    <div className="inline inline--tight">
      {picked.map(key => (
        <Chip key={key} onRemove={() => onChange(picked.filter(other => other !== key))}>{labelOf(key)}</Chip>
      ))}
      {free.length && groups.length ? (
        <select className="select" value="" onChange={e => { if (e.target.value) onChange([...picked, e.target.value]); }}>
          <option value="">{prompt}</option>
          {groups.map(group => (
            <optgroup key={group} label={group}>
              {free.filter(o => o.group === group).map(o => (
                <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : free.length ? (
        <Select
          value=""
          options={[['', prompt], ...free.map(o => [String(o.value), o.label] as const)] as never}
          onChange={next => { if (next) onChange([...picked, next]); }}
        />
      ) : null}
    </div>
  );
}
