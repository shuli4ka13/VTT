import { useMemo } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { Verdict } from './primitives.tsx';
import { FormulaField } from './formula-field.tsx';
import { fieldPaths } from './paths.ts';
import { ownerOf, OWNER_WORDS } from '@vtt/engine/engine/owners';
import { fieldOf } from '@vtt/engine/model/sheet-columns';

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
  const field = fieldOf(system, tag);
  if (field) return field.label ?? tag;
  return fieldPaths(system).get(tag) ?? system.effects?.[tag]?.label ?? tag;
}

export function formulaAsLabels(
  system: System,
  source: string,
  names?: Map<string, string>,
): string {
  const lookups = source.replace(/таблица\(\s*(["'])([^"']*)\1\s*,([^,()]*(?:\([^()]*\)[^,()]*)*)(?:,\s*(["'])([^"']*)\4)?\s*\)/gu,
    (whole, _q, table: string, arg: string, _q2, column?: string) => {
      const found = system.tables?.[table];
      if (!found) return whole;
      const col = column ? found.columns?.find(c => c.key === column) : undefined;
      return `«${found.label || table}»${col ? ` → ${col.label || col.key}` : ''} по ${arg.trim()}`;
    });
  return lookups.replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, name: string) => {
    if (ownerOf(name)) return labelOfTag(system, name);
    const field = fieldOf(system, name);
    if (field) return field.label ?? name;
    return names?.get(name) ?? fieldPaths(system).get(name) ?? system.effects?.[name]?.label ?? name;
  });
}

export function FormulaInput({ system, value, onChange, placeholder, where = 'формула' }: {
  system: System;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  where?: string;
}) {
  const parsed = useMemo(() => parseFormula(value), [value]);

  return (
    <div className="stack stack--tight">
      <FormulaField
        value={value}
        system={system}
        where={where}
        placeholder={placeholder ?? 'наберите @ и выберите поле'}
        onChange={onChange}
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
