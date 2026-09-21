import { useState } from 'react';
import { Chip, Input, Select, Button } from '../../ui/primitives.tsx';

export type Tag = string | { param: string };

const same = (a: Tag, b: Tag): boolean =>
  (typeof a === 'string' && typeof b === 'string' && a === b)
  || (typeof a === 'object' && typeof b === 'object' && a.param === b.param);

export function TagPick({ value, known, fromRecord, onChange }: {
  value: Tag[];
  known: string[];
  fromRecord: { key: string; label: string }[];
  onChange: (next: Tag[]) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const has = (tag: Tag) => value.some(other => same(other, tag));
  const add = (tag: Tag) => { if (!has(tag)) onChange([...value, tag]); };
  const drop = (tag: Tag) => onChange(value.filter(other => !same(other, tag)));

  const freeWords = known.filter(word => !has(word));
  const freeProps = fromRecord.filter(prop => !has({ param: prop.key }));

  const commit = () => {
    const clean = draft.trim();
    if (clean) add(clean);
    setDraft('');
    setTyping(false);
  };

  return (
    <div className="stack stack--tight">
      {value.length ? (
        <div className="inline inline--tight">
          {value.map((tag, at) => (
            <Chip
              key={at}
              active={typeof tag === 'string'}
              title={typeof tag === 'string' ? undefined : 'значение придёт из записи компендиума'}
              onRemove={() => drop(tag)}
            >
              {typeof tag === 'string'
                ? tag
                : `${fromRecord.find(p => p.key === tag.param)?.label ?? tag.param} — из записи`}
            </Chip>
          ))}
        </div>
      ) : null}

      {typing ? (
        <div className="inline inline--tight">
          <Input
            value={draft} placeholder="как назвать метку" onChange={setDraft}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
          />
          <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={commit}>добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(''); setTyping(false); }}>отмена</Button>
        </div>
      ) : (
        <Select
          value=""
          options={[
            ['', '+ метка…'],
            ...freeWords.map(word => [`слово:${word}`, word] as const),
            ...freeProps.map(prop => [`запись:${prop.key}`, `${prop.label} — из записи`] as const),
            ['своя', 'своя, новая…'],
          ] as never}
          onChange={(picked: string) => {
            if (!picked) return;
            if (picked === 'своя') { setTyping(true); return; }
            if (picked.startsWith('запись:')) add({ param: picked.slice('запись:'.length) });
            else add(picked.slice('слово:'.length));
          }}
        />
      )}
    </div>
  );
}
