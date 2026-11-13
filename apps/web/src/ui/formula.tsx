import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { Verdict } from './primitives.tsx';
import { FormulaField } from './formula-field.tsx';
import type { SheetNames } from './formula-chips.tsx';
import type { BarOption } from '../store/formula-bar.ts';

export { columnPaths, fieldPaths } from './paths.ts';
export { labelOfTag, formulaAsLabels } from './formula-labels.ts';

export interface Parsed {
  ok: boolean;
  deps: string[];
  error?: string;
  pos?: number;
}

export function parseFormula(source: string): Parsed {
  const text = source.trim();
  if (!text) return { ok: false, deps: [], error: 'формула пуста' };
  try {
    const formula = compile(text);
    return { ok: true, deps: [...formula.deps] };
  } catch (err) {
    const error = err as { raw?: string; message: string; pos?: number };
    return { ok: false, deps: [], error: error.raw ?? error.message, pos: error.pos };
  }
}

export function FormulaInput({ system, value, onChange, placeholder, where = 'формула', names, extraNames, meanings, badges, sheets, options, problem }: {
  system: System;
  names?: Record<string, ReactNode>;
  extraNames?: Map<string, string>;
  meanings?: Map<string, string>;
  badges?: Map<string, string>;
  sheets?: SheetNames;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  where?: string;
  options?: BarOption[];
  problem?: string | null;
}) {
  const parsed = useMemo(() => parseFormula(value), [value]);

  return (
    <div className="stack stack--tight">
      <FormulaField
        value={value}
        system={system}
        where={where}
        {...(names ? { names } : {})}
        {...(extraNames ? { extraNames } : {})}
        {...(meanings ? { meanings } : {})}
        {...(badges ? { badges } : {})}
        {...(sheets ? { sheets } : {})}
        {...(options ? { options } : {})}
        placeholder={placeholder ?? 'наберите @ и выберите поле'}
        onChange={onChange}
      />

      {value.trim() ? (
        parsed.ok && problem
          ? <Verdict tone="bad">{problem}</Verdict>
          : parsed.ok
          ? <Verdict tone="ok">правило верное · зависит от {parsed.deps.length}</Verdict>
          : <Verdict tone="bad">
              {parsed.error}
              {parsed.pos === undefined ? null : <span className="faint"> · позиция {parsed.pos}</span>}
            </Verdict>
      ) : null}
    </div>
  );
}
