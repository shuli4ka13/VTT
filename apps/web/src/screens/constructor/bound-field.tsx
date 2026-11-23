import { Input } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { System } from '@vtt/schema';
import { useT } from '../../i18n/author.ts';

export type Bound = number | { expr: string };

export const boundText = (bound: unknown): string =>
  (bound === undefined || bound === null ? '' : typeof bound === 'number' ? String(bound) : String((bound as { expr?: unknown }).expr ?? ''));

export const boundOf = (text: string): Bound | null =>
  (!text.trim() ? null : /^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : { expr: text.trim() });

export function BoundField({ value, onChange, placeholder }: {
  value: unknown;
  onChange: (next: Bound | null) => void;
  placeholder?: string;
}) {
  const t = useT('fields');
  return <Input mono value={boundText(value)} placeholder={placeholder ?? t('bound.placeholder')} onChange={text => onChange(boundOf(text))} />;
}

export function BoundFormula({ value, onChange, system, where, table, names, placeholder }: {
  value: unknown;
  onChange: (next: Bound | null) => void;
  system: System;
  where: string;
  table?: string;
  names?: Map<string, string>;
  placeholder?: string;
}) {
  const t = useT('fields');
  return (
    <FormulaField
      value={boundText(value)}
      system={system}
      where={where}
      placeholder={placeholder ?? t('bound.placeholder')}
      {...(table ? { table } : {})}
      {...(names ? { extraNames: names } : {})}
      onCommit={text => onChange(boundOf(text))}
    />
  );
}
