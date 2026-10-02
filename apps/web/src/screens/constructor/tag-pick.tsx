import { useState } from 'react';
import { Chip, Input, Select, Button } from '../../ui/primitives.tsx';

export type Tag = string;

const same = (a: Tag, b: Tag): boolean => a === b;

export function TagPick({ value, known, onChange }: {
  value: Tag[];
  known: string[];
  onChange: (next: Tag[]) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const has = (tag: Tag) => value.some(other => same(other, tag));
  const add = (tag: Tag) => { if (!has(tag)) onChange([...value, tag]); };
  const drop = (tag: Tag) => onChange(value.filter(other => !same(other, tag)));

  const freeWords = known.filter(word => !has(word));

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
            <Chip key={at} active onRemove={() => drop(tag)}>{tag}</Chip>
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
            ['своя', 'своя, новая…'],
          ] as never}
          onChange={(picked: string) => {
            if (!picked) return;
            if (picked === 'своя') { setTyping(true); return; }
            add(picked.slice('слово:'.length));
          }}
        />
      )}
    </div>
  );
}
