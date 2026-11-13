import { useState } from 'react';
import { Input } from './primitives.tsx';
import { keyOf } from '../screens/constructor/keys.ts';

export function KeyField({ value, locked, taken, onChange, optional = false }: {
  value: string;
  optional?: boolean;
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
        invalid={(!next && !optional) || busy}
        onChange={setDraft}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onBlur={() => {
          if (draft !== null && !busy && next !== value && (next || optional)) onChange(next);
          setDraft(null);
        }}
      />
      {busy ? <span className="field__error">имя «{next}» уже занято</span> : null}
    </>
  );
}
