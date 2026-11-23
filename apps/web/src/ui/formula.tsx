import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine';
import { Verdict } from './primitives.tsx';
import { FormulaField } from './formula-field.tsx';
import { namesOf } from './formula-chips.tsx';
import type { SheetNames } from './formula-chips.tsx';
import { resolveNames, NO_NAME } from './formula-resolve.ts';
import type { BarOption } from '../store/formula-bar.ts';
import { t, useT } from '../i18n/index.ts';

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
  if (!text) return { ok: false, deps: [], error: t('ui:formula.empty') };
  try {
    const formula = compile(text);
    return { ok: true, deps: [...formula.deps] };
  } catch (err) {
    const error = err as { raw?: string; message: string; pos?: number };
    return { ok: false, deps: [], error: error.raw ?? error.message, pos: error.pos };
  }
}

export function FormulaInput({ system, value, onChange, placeholder, where, names, extraNames, meanings, badges, sheets, options, problem }: {
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
  const t = useT('ui');
  const known = useMemo(() => namesOf(system, { extraNames, extraOptions: options, sheets }), [system, extraNames, options, sheets]);
  const settled = useMemo(() => resolveNames(value, known, { final: true }), [value, known]);
  const parsed = useMemo(() => parseFormula(settled.text), [settled.text]);
  const lost = parsed.ok ? undefined : settled.unknown[0];

  return (
    <div className="stack stack--tight">
      <FormulaField
        value={value}
        system={system}
        where={where ?? t('formula.where')}
        {...(names ? { names } : {})}
        {...(extraNames ? { extraNames } : {})}
        {...(meanings ? { meanings } : {})}
        {...(badges ? { badges } : {})}
        {...(sheets ? { sheets } : {})}
        {...(options ? { options } : {})}
        placeholder={placeholder ?? t('formula.placeholder')}
        notes={false}
        onChange={onChange}
      />

      {value.trim() ? (
        parsed.ok && problem
          ? <Verdict tone="bad">{problem}</Verdict>
          : parsed.ok
          ? <Verdict tone="ok">{t('formula.ok', { n: parsed.deps.length })}</Verdict>
          : lost
          ? <Verdict tone="bad">{NO_NAME(lost)}</Verdict>
          : <Verdict tone="bad">
              {parsed.error}
              {parsed.pos === undefined ? null : <span className="faint">{t('formula.pos', { pos: parsed.pos })}</span>}
            </Verdict>
      ) : null}
    </div>
  );
}
