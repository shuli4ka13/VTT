import { useState } from 'react';
import { Chip, Input, Button, Select } from '../../ui/primitives.tsx';

export function WordList({ value, known, onChange, placeholder = 'новое слово' }: {
  value: string[];
  known: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const free = known.filter(word => !value.includes(word)).sort((a, b) => a.localeCompare(b, 'ru'));

  const add = (word: string) => {
    const clean = word.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setDraft('');
  };

  return (
    <div className="stack stack--tight">
      {value.length ? (
        <div className="inline inline--tight">
          {value.map(word => (
            <Chip key={word} active onRemove={() => onChange(value.filter(other => other !== word))}>
              {word}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="inline inline--tight">
        {free.length ? (
          <Select
            value=""
            options={[['', `+ из уже заведённых (${free.length})`],
              ...free.map(word => [word, word] as const)] as never}
            onChange={word => { if (word) add(word); }}
          />
        ) : null}
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={setDraft}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(draft); } }}
        />
        <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={() => add(draft)}>+</Button>
      </div>
    </div>
  );
}
