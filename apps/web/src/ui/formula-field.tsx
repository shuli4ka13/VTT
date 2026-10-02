import type { SheetNames } from './formula-chips.tsx';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { useFormulaBar } from '../store/formula-bar.ts';
import type { BarOption } from '../store/formula-bar.ts';
import { FormulaChips } from './formula-chips.tsx';
import { useLookup } from '../store/lookup.ts';

export interface FormulaFieldProps {
  value: string;
  system: System;
  where: string;
  onChange?: (text: string) => void;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
  names?: Record<string, ReactNode>;
  extraNames?: Map<string, string>;
  badges?: Map<string, string>;
  sheets?: SheetNames;
  placeholder?: string;
  options?: BarOption[];
  prefix?: ReactNode;
  invalid?: boolean;
  barValue?: string;
}

export function FormulaField(props: FormulaFieldProps) {
  const id = useId();
  const hosted = useFormulaBar(s => s.hosts > 0);
  const spot = useFormulaBar(s => (s.target?.id === id ? s.target : null));
  const open = useFormulaBar(s => s.open);
  const { value, system, names, extraNames, badges, sheets, placeholder, prefix, invalid } = props;

  if (!hosted) return <InlineFormula {...props} />;

  const shown = spot ? spot.value : value;
  const start = () => open({
        id, where: props.where, value: props.barValue ?? value, system,
        ...(names ? { names } : {}),
        ...(extraNames ? { extraNames } : {}),
        ...(badges ? { badges } : {}),
        ...(sheets ? { sheets } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(props.options ? { options: props.options } : {}),
        ...(props.onChange ? { onChange: props.onChange } : {}),
        ...(props.onCommit ? { onCommit: props.onCommit } : {}),
        ...(props.onCancel ? { onCancel: props.onCancel } : {}),
      });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`formula-field${spot ? ' formula-field--spot' : ''}${invalid ? ' formula-field--bad' : ''}`}
      title={shown || placeholder}
      onClick={start}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } }}
    >
      {spot ? null : prefix}
      {shown || spot || !prefix ? (
        <FormulaChips
          value={shown}
          system={system}
          {...(names ? { names } : {})}
          {...(extraNames ? { extraNames } : {})}
          {...(badges ? { badges } : {})}
          {...(sheets ? { sheets } : {})}
          {...(placeholder ? { placeholder } : {})}
          readOnly
          onChipPick={(name, label) => useLookup.getState().show({ name, label, where: props.where })}
          onChange={() => {}}
        />
      ) : null}
    </div>
  );
}

function InlineFormula({ value, system, onChange, onCommit, onCancel, names, extraNames, badges, sheets, placeholder, options, prefix }: FormulaFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const current = text ?? value;
  const write = (next: string) => { setText(next); onChange?.(next); };
  const commit = () => { if (text !== null) onCommit?.(text); setText(null); };
  const api = { write, dismiss: () => setText(null) };
  return (
    <FormulaChips
      value={current}
      system={system}
      {...(names ? { names } : {})}
      {...(extraNames ? { extraNames } : {})}
      {...(badges ? { badges } : {})}
      {...(sheets ? { sheets } : {})}
      {...(placeholder ? { placeholder } : {})}
      {...(prefix ? { prefix } : {})}
      calculator
      extraOptions={(options ?? []).map(option => ({
        group: option.group,
        label: option.label,
        ...(option.name ? { name: option.name } : {}),
        onPick: (insert: (piece: string) => string) => option.onPick(insert, api),
      }))}
      onChange={write}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setText(null); onCancel?.(); }
      }}
    />
  );
}
