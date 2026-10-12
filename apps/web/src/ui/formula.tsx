import { useMemo } from 'react';
import type { System } from '@vtt/schema';
import { compile } from '@vtt/engine/formula';
import { Verdict } from './primitives.tsx';
import { FormulaField } from './formula-field.tsx';
import type { BarOption } from '../store/formula-bar.ts';
import { fieldPaths } from './paths.ts';
import { fieldOf, ROW } from '@vtt/engine/model/sheet-columns';

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

const onSheet = (system: System, tag: string): { head: string; rest: string } | null => {
  const dot = tag.indexOf('.');
  if (dot <= 0 || tag.startsWith(`${ROW}.`) || fieldOf(system, tag) || fieldPaths(system).has(tag)) return null;
  const rest = tag.slice(dot + 1);
  return fieldOf(system, rest) || fieldPaths(system).has(rest) || system.effects?.[rest] ? { head: tag.slice(0, dot), rest } : null;
};

export function labelOfTag(system: System, tag: string): string {
  const owned = onSheet(system, tag);
  if (owned) return `${labelOfTag(system, owned.rest)} (${owned.head})`;
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
  const picks = lookups.replace(/[@#]([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)\.\[([^[\]]*)\]((?:\.[\p{L}\p{N}_]+)*)/gu,
    (_, tag: string, by: string, rest: string) =>
      `${labelOfTag(system, tag)} · колонка по [${formulaAsLabels(system, by, names)}]${rest ? ` · ${rest.slice(1)}` : ''}`);
  return picks.replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, name: string) => {
    if (onSheet(system, name)) return labelOfTag(system, name);
    const field = fieldOf(system, name);
    if (field) return field.label ?? name;
    return names?.get(name) ?? fieldPaths(system).get(name) ?? system.effects?.[name]?.label ?? name;
  });
}

export function FormulaInput({ system, value, onChange, placeholder, where = 'формула', extraNames, options, problem }: {
  system: System;
  extraNames?: Map<string, string>;
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
        {...(extraNames ? { extraNames } : {})}
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
