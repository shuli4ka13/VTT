import { useMemo } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { Verdict } from './primitives.tsx';
import { FormulaChips } from './formula-chips.tsx';
import { fieldPaths } from './paths.ts';
import { ownerOf, OWNER_WORDS } from '@vtt/engine/engine/owners';

export { columnPaths, fieldPaths } from './paths.ts';

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

export function labelOfTag(system: System, tag: string): string {
  const owned = ownerOf(tag);
  if (owned) return `${labelOfTag(system, owned.rest)} ${OWNER_WORDS[owned.owner]}`;
  const field = system.fields.find(f => f.tag === tag);
  if (field) return field.label ?? tag;
  return fieldPaths(system).get(tag) ?? tag;
}

export function formulaAsLabels(
  system: System,
  source: string,
  names?: Map<string, string>,
): string {
  return source.replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, name: string) => {
    if (ownerOf(name)) return labelOfTag(system, name);
    const field = system.fields.find(f => f.tag === name);
    if (field) return field.label ?? name;
    return names?.get(name) ?? fieldPaths(system).get(name) ?? name;
  });
}

export function FormulaInput({ system, value, onChange, placeholder }: {
  system: System;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const parsed = useMemo(() => parseFormula(value), [value]);

  return (
    <div className="stack stack--tight">
      <FormulaChips
        value={value}
        system={system}
        placeholder={placeholder ?? 'наберите @ и выберите поле'}
        onChange={onChange}
        calculator
      />

      {value.trim() ? (
        parsed.ok
          ? <Verdict tone="ok">правило верное · зависит от {parsed.deps.length}</Verdict>
          : <Verdict tone="bad">
              {parsed.error}
              {parsed.pos === undefined ? null : <span className="faint"> · позиция {parsed.pos}</span>}
            </Verdict>
      ) : null}
    </div>
  );
}
