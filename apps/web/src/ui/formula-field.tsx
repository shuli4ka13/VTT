import type { SheetNames } from './formula-chips.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { useFormulaBar } from '../store/formula-bar.ts';
import type { BarOption } from '../store/formula-bar.ts';
import { FormulaChips } from './formula-chips.tsx';
import { useLookup } from '../store/lookup.ts';
import { formulaAsLabels } from './formula-labels.ts';

export interface FormulaFieldProps {
  value: string;
  system: System;
  where: string;
  onChange?: (text: string) => void;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
  names?: Record<string, ReactNode>;
  extraNames?: Map<string, string>;
  meanings?: Map<string, string>;
  badges?: Map<string, string>;
  sheets?: SheetNames;
  placeholder?: string;
  options?: BarOption[];
  prefix?: ReactNode;
  invalid?: boolean;
  barValue?: string;
  table?: string;
  spoken?: string;
  whole?: boolean;
  notes?: boolean;
}

function SpokenFormula({ words, formula, system, names, onOpen }: { words: string; formula: string; system: System; names?: Map<string, string>; onOpen: () => void }) {
  return <button type="button" className="formula-words" title={formulaAsLabels(system, formula, names)} onClick={onOpen}>{words}</button>;
}

export function FormulaField(props: FormulaFieldProps) {
  const id = useId();
  const hosted = useFormulaBar(s => s.hosts > 0);
  const spot = useFormulaBar(s => (s.target?.id === id ? s.target : null));
  const open = useFormulaBar(s => s.open);
  useEffect(() => () => {
    const bar = useFormulaBar.getState();
    if (bar.target?.id === id) bar.commit();
  }, [id]);
  const { value, system, names, extraNames, badges, sheets, placeholder, prefix, invalid, spoken } = props;

  if (!hosted) return <InlineFormula {...props} />;

  const shown = spot ? spot.value : value;
  const start = () => open({
        id, where: props.where, value: props.barValue ?? value, system,
        ...(props.table ? { table: props.table } : {}),
        ...(names ? { names } : {}),
        ...(extraNames ? { extraNames } : {}),
        ...(props.meanings ? { meanings: props.meanings } : {}),
        ...(badges ? { badges } : {}),
        ...(sheets ? { sheets } : {}),
        ...(props.whole ? { whole: true } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(props.options ? { options: props.options } : {}),
        ...(props.onChange ? { onChange: props.onChange } : {}),
        ...(props.onCommit ? { onCommit: props.onCommit } : {}),
        ...(props.onCancel ? { onCancel: props.onCancel } : {}),
      });
  if (spoken && !spot) return <SpokenFormula words={spoken} formula={value} system={system} {...(extraNames ? { names: extraNames } : {})} onOpen={start} />;
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
          onChipPick={(name, label) => useLookup.getState().show({ name, label, where: props.where, ...(props.table ? { table: props.table } : {}), ...(props.meanings?.has(name) ? { meaning: props.meanings.get(name)! } : {}) })}
          onChange={() => {}}
        />
      ) : null}
    </div>
  );
}

function InlineFormula({ value, system, onChange, onCommit, onCancel, names, extraNames, badges, sheets, placeholder, options, prefix, table, spoken, whole, notes }: FormulaFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const current = text ?? value;
  const final = useRef<string | null>(null);
  const write = (next: string) => { final.current = null; setText(next); onChange?.(next); };
  const close = () => { final.current = null; setText(null); setAsked(false); };
  const commit = () => {
    if (text !== null) {
      const done = final.current ?? text;
      if (done !== text) onChange?.(done);
      onCommit?.(done);
    }
    close();
  };
  const api = { write, dismiss: () => setText(null) };
  if (spoken && !asked) return <SpokenFormula words={spoken} formula={value} system={system} {...(extraNames ? { names: extraNames } : {})} onOpen={() => setAsked(true)} />;
  return (
    <FormulaChips
      value={current}
      system={system}
      {...(table ? { table } : {})}
      {...(names ? { names } : {})}
      {...(extraNames ? { extraNames } : {})}
      {...(badges ? { badges } : {})}
      {...(sheets ? { sheets } : {})}
      {...(placeholder ? { placeholder } : {})}
      {...(prefix ? { prefix } : {})}
      calculator
      {...(notes === false ? { notes: false } : {})}
      {...(whole ? { whole: true } : {})}
      {...(asked ? { autoFocus: true } : {})}
      extraOptions={(options ?? []).map(option => ({
        group: option.group,
        label: option.label,
        ...(option.name ? { name: option.name } : {}),
        onPick: (insert: (piece: string) => string) => option.onPick(insert, api),
      }))}
      onChange={write}
      onFinal={text => { final.current = text; }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { close(); onCancel?.(); }
      }}
    />
  );
}

export function FormulaView({ value, system, extraNames, sheets }: { value: string; system: System; extraNames?: Map<string, string>; sheets?: SheetNames }) {
  return <FormulaChips value={value} system={system} {...(extraNames ? { extraNames } : {})} {...(sheets ? { sheets } : {})} readOnly onChange={() => {}} />;
}
