import { useState } from 'react';
import type { System } from '@vtt/schema';
import { Select } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { SheetNames } from '../../ui/formula-chips.tsx';

const BY_FORMULA = ':формула';

export const loneSheet = (ref: unknown): string =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? '';

export function SheetPick({ value, onChange, sheets, system, empty = '— какой лист —', where, extra = [] }: {
  value: unknown;
  onChange: (next: { expr: string } | null) => void;
  sheets: SheetNames | undefined;
  system: System;
  empty?: string;
  where: string;
  extra?: readonly (readonly [string, string])[];
}) {
  const expr = String((value as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const named = loneSheet(value);
  const list = [...(sheets ?? new Map<string, string>())];
  const presets = extra.filter(([formula]) => formula !== '');
  const preset = presets.find(([formula]) => formula === expr);
  const [typing, setTyping] = useState(false);
  const custom = typing || (expr !== '' && !list.some(([name]) => name === named) && !preset);
  return (
    <span className="inline inline--tight">
      <Select<string>
        value={custom ? BY_FORMULA : preset ? preset[0] : named}
        options={[['', empty],
          ...list.map(([name, label]) => [name, `«${label}»`] as const),
          ...presets,
          [BY_FORMULA, 'формулой…']]}
        onChange={next => {
          if (next === BY_FORMULA) { setTyping(true); return; }
          setTyping(false);
          if (!next) { onChange(null); return; }
          if (presets.some(([formula]) => formula === next)) { onChange({ expr: next }); return; }
          onChange({ expr: `@${next}` });
        }}
      />
      {custom ? (
        <FormulaField
          value={expr}
          system={system}
          where={where}
          {...(sheets ? { sheets } : {})}
          placeholder="например: первый(@цели)"
          onCommit={text => { setTyping(false); onChange(text.trim() ? { expr: text.trim() } : null); }}
        />
      ) : null}
    </span>
  );
}
