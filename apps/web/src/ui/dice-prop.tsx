import { useState } from 'react';
import { Input } from './primitives.tsx';

export function DiceProp({ value, onChange }: {
  value: string;
  onChange: (next: string) => void;
}) {
  const m = /^(\d+)?\s*[dдк]\s*(\d+)$/iu.exec(value.trim());
  const stored = { count: m ? (m[1] ?? '1') : '', sides: m ? m[2]! : '' };

  const [draft, setDraft] = useState<{ count: string; sides: string } | null>(null);
  const shown = draft ?? stored;

  const commit = (next: { count: string; sides: string }) => {
    const c = Number(next.count);
    const n = Number(next.sides);
    if (Number.isInteger(c) && c > 0 && Number.isInteger(n) && n > 1) {
      onChange(`${c}d${n}`);
      setDraft(null);
    }
  };

  const edit = (part: 'count' | 'sides') => (text: string) => {
    const next = { ...shown, [part]: text };
    setDraft(next);
    commit(next);
  };

  return (
    <div className="dice-term">
      <span className="dice-term__num">
        <Input mono value={shown.count} placeholder="1"
          onChange={edit('count')} onBlur={() => commit(shown)} />
      </span>
      <span className="dice-term__d">к</span>
      <span className="dice-term__num">
        <Input mono value={shown.sides} placeholder="8"
          onChange={edit('sides')} onBlur={() => commit(shown)} />
      </span>
    </div>
  );
}
