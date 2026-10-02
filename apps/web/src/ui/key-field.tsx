import { useState } from 'react';
import { Input } from './primitives.tsx';
import { keyOf } from '../screens/constructor/keys.ts';

export function KeyField({ value, locked, taken, onChange }: {
  value: string;
  locked: boolean;
  taken: readonly string[];
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (locked) {
    return <span className="faint" title="на это имя уже ссылаются — переименование появится позже">{value}</span>;
  }
  const next = keyOf(draft ?? value);
  const busy = next !== value && taken.includes(next);
  return (
    <>
      <Input
        mono
        value={draft ?? value}
        invalid={!next || busy}
        onChange={setDraft}
        onBlur={() => {
          if (draft !== null && next && !busy && next !== value) onChange(next);
          setDraft(null);
        }}
      />
      {busy ? <span className="field__error">имя «{next}» уже занято</span> : null}
    </>
  );
}
