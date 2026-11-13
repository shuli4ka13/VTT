import { useState, type ReactNode } from 'react';
import { typedChoices, type Want } from '@vtt/engine/model/typed-choices';
import { Combo, type ComboOption } from '../../ui/combo.tsx';
import type { SlotContext } from './slots.tsx';

export const BY_FORMULA = ':формула';

const exprOf = (value: unknown): string =>
  (value && typeof value === 'object' && 'expr' in value ? String((value as { expr: unknown }).expr) : value === undefined || value === null ? '' : String(value)).trim();

export function TypedPick({ want, value, onChange, context, blank, label, children }: {
  want: Want;
  value: unknown;
  onChange: (next: { expr: string } | null) => void;
  context: SlotContext;
  blank: string;
  label?: string;
  children: ReactNode;
}) {
  const [formula, setFormula] = useState(false);
  if (!context.scope) return <>{children}</>;
  const choices = typedChoices(context.system, context.scope, want);
  const text = exprOf(value);
  const listed = choices.some(one => one.expr === text);
  const byFormula = formula || (text !== '' && !listed);
  const options: ComboOption[] = [
    ...(text ? [{ value: '', label: blank }] : []),
    ...choices.map(one => ({ value: one.expr, label: one.label, group: one.group })),
    { value: BY_FORMULA, label: 'формулой…', group: 'другое' },
  ];
  return (
    <div className="stack stack--tight typed-pick">
      <Combo
        value={byFormula ? BY_FORMULA : text}
        blank={blank}
        options={options}
        {...(label ? { label } : {})}
        onChange={next => {
          if (next === BY_FORMULA) { setFormula(true); return; }
          setFormula(false);
          onChange(next ? { expr: next } : null);
        }}
      />
      {byFormula ? children : null}
    </div>
  );
}
